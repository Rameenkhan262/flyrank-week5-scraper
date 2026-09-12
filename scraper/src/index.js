const fs = require("fs/promises");
const path = require("path");
const cheerio = require("cheerio");

const BASE_URL = "https://books.toscrape.com/";
const FIRST_PAGE_URL =
    "https://books.toscrape.com/catalogue/page-1.html";

const CACHE_DIR = path.join(__dirname, "../cache");
const DETAIL_CACHE_DIR = path.join(CACHE_DIR, "details");
const OUTPUT_DIR = path.join(__dirname, "../output");

const BOOKS_FILE = path.join(OUTPUT_DIR, "books.json");
const ERRORS_FILE = path.join(OUTPUT_DIR, "errors.json");

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

    // Remove duplicate product URLs.
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
 * Convert price text such as:
 * £51.77
 *
 * into:
 * 51.77
 */
function normalizePrice(priceText) {
    if (!priceText) {
        return null;
    }

    const match = priceText.match(
        /£\s*([0-9]+(?:\.[0-9]+)?)/
    );

    if (!match) {
        return null;
    }

    return Number(match[1]);
}

/**
 * Convert rating text such as:
 * One
 * Two
 * Three
 * Four
 * Five
 *
 * into an integer.
 */
function normalizeRating(ratingText) {
    const ratings = {
        One: 1,
        Two: 2,
        Three: 3,
        Four: 4,
        Five: 5
    };

    return ratings[ratingText] ?? null;
}

/**
 * Convert availability text such as:
 * In stock (22 available)
 *
 * into:
 * {
 *   in_stock: true,
 *   count: 22
 * }
 */
function normalizeAvailability(
    availabilityText
) {
    if (!availabilityText) {
        return {
            in_stock: false,
            count: 0
        };
    }

    const normalized =
        availabilityText
            .replace(/\s+/g, " ")
            .trim();

    const inStock =
        normalized
            .toLowerCase()
            .includes("in stock");

    const countMatch =
        normalized.match(
            /\((\d+)\s+available\)/
        );

    const count =
        countMatch
            ? Number(countMatch[1])
            : 0;

    return {
        in_stock: inStock,
        count
    };
}

/**
 * Normalize one raw record.
 */
function normalizeRecord(raw) {
    return {
        title: raw.title || null,

        product_url: raw.product_url,

        price_gbp:
            normalizePrice(
                raw.price_text
            ),

        availability:
            normalizeAvailability(
                raw.availability_text
            ),

        rating:
            normalizeRating(
                raw.rating_text
            ),

        description:
            raw.description || null,

        upc: raw.upc || null,

        source_page:
            raw.source_page,

        fetched_at:
            raw.fetched_at
    };
}

/**
 * Validate one normalized record.
 */
function validateRecord(record) {
    const errors = [];

    if (
        !record.title ||
        typeof record.title !== "string"
    ) {
        errors.push(
            "title is missing or invalid"
        );
    }

    if (
        typeof record.product_url !== "string"
    ) {
        errors.push(
            "product_url is missing"
        );
    } else {
        try {
            const url =
                new URL(
                    record.product_url
                );

            if (
                url.protocol !== "https:"
            ) {
                errors.push(
                    "product_url must use HTTPS"
                );
            }
        } catch {
            errors.push(
                "product_url is not a valid URL"
            );
        }
    }

    if (
        typeof record.price_gbp !== "number" ||
        !Number.isFinite(
            record.price_gbp
        )
    ) {
        errors.push(
            "price_gbp must be a number"
        );
    }

    if (
        !record.availability ||
        typeof record.availability
            .in_stock !== "boolean"
    ) {
        errors.push(
            "availability.in_stock must be boolean"
        );
    }

    if (
        !record.availability ||
        !Number.isInteger(
            record.availability.count
        ) ||
        record.availability.count < 0
    ) {
        errors.push(
            "availability.count must be a non-negative integer"
        );
    }

    if (
        !Number.isInteger(
            record.rating
        ) ||
        record.rating < 1 ||
        record.rating > 5
    ) {
        errors.push(
            "rating must be an integer from 1 to 5"
        );
    }

    if (
        !record.upc ||
        typeof record.upc !== "string"
    ) {
        errors.push(
            "upc is missing or invalid"
        );
    }

    return errors;
}

/**
 * Normalize and validate all records.
 */
async function normalizeAndValidate(
    rawRecords
) {
    const validRecords = [];
    const errors = [];
    const seenUrls = new Set();

    for (
        let i = 0;
        i < rawRecords.length;
        i++
    ) {
        const raw = rawRecords[i];

        const record =
            normalizeRecord(raw);

        const recordErrors =
            validateRecord(record);

        // Check duplicate product URLs.
        if (
            seenUrls.has(
                record.product_url
            )
        ) {
            recordErrors.push(
                "duplicate product_url"
            );
        }

        if (recordErrors.length === 0) {
            seenUrls.add(
                record.product_url
            );

            validRecords.push(
                record
            );
        } else {
            errors.push({
                product_url:
                    record.product_url,
                errors: recordErrors
            });
        }
    }

    await fs.mkdir(
        OUTPUT_DIR,
        {
            recursive: true
        }
    );

    await fs.writeFile(
        BOOKS_FILE,
        JSON.stringify(
            validRecords,
            null,
            2
        ),
        "utf8"
    );

    await fs.writeFile(
        ERRORS_FILE,
        JSON.stringify(
            errors,
            null,
            2
        ),
        "utf8"
    );

    console.log("");
    console.log(
        `valid_records=${validRecords.length}`
    );

    console.log(
        `invalid_records=${errors.length}`
    );

    console.log(
        `books.json=${BOOKS_FILE}`
    );

    console.log(
        `errors.json=${ERRORS_FILE}`
    );

    if (validRecords.length !== 60) {
        throw new Error(
            `Expected 60 valid records, found ${validRecords.length}`
        );
    }

    return {
        validRecords,
        errors
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

        const cached =
            await readCachedDetailPage(
                index
            );

        let html;

        if (cached) {
            html = cached;
        } else {
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

/**
 * Main Stage 4 flow.
 */
async function main() {
    const rawRecords =
        await extractBookDetails();

    const result =
        await normalizeAndValidate(
            rawRecords
        );

    console.log("");
    console.log(
        "Stage 4 completed successfully."
    );

    console.log(
        `books.json contains ${result.validRecords.length} records.`
    );
}

main().catch(error => {
    console.error(
        "Stage 4 failed:",
        error.message
    );

    process.exit(1);
});