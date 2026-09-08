const fs = require("fs/promises");
const path = require("path");
const cheerio = require("cheerio");

const BASE_URL = "https://books.toscrape.com/";
const FIRST_PAGE_URL =
    "https://books.toscrape.com/catalogue/page-1.html";

const CACHE_DIR = path.join(__dirname, "../cache");
const DETAIL_CACHE_DIR = path.join(CACHE_DIR, "details");

const USER_AGENT = "FlyRankInternship-A9/1.0";
const DELAY_MS = 500;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function catalogueCacheFile(pageNumber) {
    return path.join(
        CACHE_DIR,
        `catalogue-page-${pageNumber}.html`
    );
}

function detailCacheFile(index) {
    return path.join(
        DETAIL_CACHE_DIR,
        `book-${String(index).padStart(3, "0")}.html`
    );
}

async function readCachedCataloguePage(pageNumber) {
    const file = catalogueCacheFile(pageNumber);

    try {
        const html = await fs.readFile(file, "utf8");

        console.log(
            `CACHE HIT: catalogue-page-${pageNumber}.html`
        );

        return html;
    } catch {
        return null;
    }
}

async function readCachedDetailPage(index) {
    const file = detailCacheFile(index);

    try {
        const html = await fs.readFile(file, "utf8");

        console.log(
            `CACHE HIT: book-${String(index).padStart(3, "0")}.html`
        );

        return html;
    } catch {
        return null;
    }
}

async function fetchDetailPage(url, index) {
    const cachedHtml = await readCachedDetailPage(index);

    if (cachedHtml) {
        return {
            html: cachedHtml,
            fromCache: true
        };
    }

    console.log(`FETCH: ${url}`);

    const response = await fetch(url, {
        headers: {
            "User-Agent": USER_AGENT
        },
        signal: AbortSignal.timeout(5000)
    });

    console.log(`Status: ${response.status}`);

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status} for ${url}`
        );
    }

    const html = await response.text();

    await fs.mkdir(DETAIL_CACHE_DIR, {
        recursive: true
    });

    await fs.writeFile(
        detailCacheFile(index),
        html,
        "utf8"
    );

    console.log(
        `Cached: book-${String(index).padStart(3, "0")}.html`
    );

    return {
        html,
        fromCache: false
    };
}

/**
 * Extract book URLs from one catalogue page.
 */
function extractBookEntries(html, pageUrl) {
    const $ = cheerio.load(html);

    const entries = [];

    $("article.product_pod h3 a").each(
        (index, element) => {
            const href = $(element).attr("href");

            if (!href) {
                return;
            }

            const productUrl = new URL(
                href,
                pageUrl
            ).href;

            entries.push({
                productUrl,
                sourcePage: pageUrl
            });
        }
    );

    return entries;
}

/**
 * Find the next catalogue page.
 */
function findNextUrl(html, currentPageUrl) {
    const $ = cheerio.load(html);

    const nextHref = $("li.next a").attr("href");

    if (!nextHref) {
        return null;
    }

    return new URL(
        nextHref,
        currentPageUrl
    ).href;
}

/**
 * Discover the 60 book URLs from the
 * three cached catalogue pages.
 */
async function discoverBookEntries() {
    let currentUrl = FIRST_PAGE_URL;
    let pageNumber = 1;

    const entries = [];

    while (
        currentUrl &&
        pageNumber <= 3
    ) {
        const html =
            await readCachedCataloguePage(
                pageNumber
            );

        if (!html) {
            throw new Error(
                `Catalogue page ${pageNumber} is not cached. Run Stage 1/2 first.`
            );
        }

        const pageEntries =
            extractBookEntries(
                html,
                currentUrl
            );

        entries.push(...pageEntries);

        const nextUrl =
            findNextUrl(
                html,
                currentUrl
            );

        if (!nextUrl) {
            break;
        }

        currentUrl = nextUrl;
        pageNumber++;
    }

    // Remove duplicate product URLs while
    // keeping the first source page.
    const uniqueEntries = [];
    const seen = new Set();

    for (const entry of entries) {
        if (!seen.has(entry.productUrl)) {
            seen.add(entry.productUrl);
            uniqueEntries.push(entry);
        }
    }

    return uniqueEntries;
}

/**
 * Extract a table value from the product
 * information section.
 */
function extractTableValue($, label) {
    let value = null;

    $("table.table-striped tr").each(
        (index, row) => {
            const key = $(row)
                .find("th")
                .first()
                .text()
                .trim();

            if (key === label) {
                value = $(row)
                    .find("td")
                    .first()
                    .text()
                    .trim();
            }
        }
    );

    return value;
}

/**
 * Extract the raw record from one book page.
 */
function extractRawRecord(
    html,
    productUrl,
    sourcePage
) {
    const $ = cheerio.load(html);

    const title =
        $("div.product_main h1")
            .first()
            .text()
            .trim();

    const priceText =
        $("div.product_main .price_color")
            .first()
            .text()
            .trim();

    const availabilityText =
        $("div.product_main .availability")
            .first()
            .text()
            .replace(/\s+/g, " ")
            .trim();

    const ratingElement =
        $("div.product_main p.star-rating")
            .first();

    let ratingText = null;

    if (ratingElement.length) {
        const classes =
            ratingElement.attr("class") || "";

        const ratingClass =
            classes
                .split(/\s+/)
                .find(
                    className =>
                        className !== "star-rating"
                );

        ratingText = ratingClass || null;
    }

    const descriptionElement =
        $("#product_description")
            .next("p");

    const description =
        descriptionElement.length
            ? descriptionElement.text().trim()
            : null;

    const upc =
        extractTableValue($, "UPC");

    return {
        title,
        product_url: productUrl,
        price_text: priceText,
        availability_text: availabilityText,
        rating_text: ratingText,
        description,
        source_page: sourcePage,
        fetched_at: new Date().toISOString(),
        upc
    };
}

/**
 * Extract all 60 book records.
 */
async function extractBookDetails() {
    const entries =
        await discoverBookEntries();

    console.log(
        `Discovered ${entries.length} unique book URLs`
    );

    if (entries.length !== 60) {
        throw new Error(
            `Expected 60 book URLs, found ${entries.length}`
        );
    }

    const records = [];

    let detailPages = 0;

    for (
        let i = 0;
        i < entries.length;
        i++
    ) {
        const entry = entries[i];

        const index = i + 1;

        // Check whether the detail page is
        // already cached before deciding to wait.
        const cached =
            await readCachedDetailPage(index);

        let html;

        if (cached) {
            html = cached;
        } else {
            // Real request: wait at least 500 ms.
            await sleep(DELAY_MS);

            const result =
                await fetchDetailPage(
                    entry.productUrl,
                    index
                );

            html = result.html;
        }

        const record =
            extractRawRecord(
                html,
                entry.productUrl,
                entry.sourcePage
            );

        records.push(record);

        detailPages++;

        console.log(
            `Extracted ${detailPages}/60`
        );
    }

    console.log("");
    console.log(
        "First complete raw record:"
    );

    console.log(
        JSON.stringify(
            records[0],
            null,
            2
        )
    );

    console.log("");
    console.log(
        `detail_pages=${detailPages}`
    );

    return records;
}

extractBookDetails().catch(error => {
    console.error(
        "Stage 3 failed:",
        error.message
    );

    process.exit(1);
});