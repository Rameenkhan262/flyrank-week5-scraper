const fs = require("fs/promises");
const path = require("path");
const cheerio = require("cheerio");

const BASE_URL = "https://books.toscrape.com/";
const FIRST_PAGE_URL = "https://books.toscrape.com/catalogue/page-1.html";

const CACHE_DIR = path.join(__dirname, "../cache");

const USER_AGENT = "FlyRankInternship-A9/1.0";
const DELAY_MS = 500;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function cacheFileForPage(pageNumber) {
    return path.join(
        CACHE_DIR,
        `catalogue-page-${pageNumber}.html`
    );
}

async function readCachedPage(pageNumber) {
    const file = cacheFileForPage(pageNumber);

    try {
        const html = await fs.readFile(file, "utf8");

        console.log(`CACHE HIT: catalogue-page-${pageNumber}.html`);

        return html;
    } catch {
        return null;
    }
}

// Check whether a page is cached without printing CACHE HIT
async function isPageCached(pageNumber) {
    try {
        await fs.access(cacheFileForPage(pageNumber));
        return true;
    } catch {
        return false;
    }
}

async function fetchPage(url, pageNumber) {
    const cachedHtml = await readCachedPage(pageNumber);

    if (cachedHtml) {
        return cachedHtml;
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
        throw new Error(`HTTP ${response.status} for ${url}`);
    }

    const html = await response.text();

    await fs.mkdir(CACHE_DIR, { recursive: true });

    await fs.writeFile(
        cacheFileForPage(pageNumber),
        html,
        "utf8"
    );

    console.log(
        `Cached: catalogue-page-${pageNumber}.html (${html.length} characters)`
    );

    return html;
}

function extractBookUrls(html, pageUrl) {
    const $ = cheerio.load(html);

    const urls = [];

    $("article.product_pod h3 a").each((index, element) => {
        const href = $(element).attr("href");

        if (!href) {
            return;
        }

        const absoluteUrl = new URL(href, pageUrl).href;

        urls.push(absoluteUrl);
    });

    return urls;
}

function findNextUrl(html, currentPageUrl) {
    const $ = cheerio.load(html);

    const nextHref = $("li.next a").attr("href");

    if (!nextHref) {
        return null;
    }

    return new URL(nextHref, currentPageUrl).href;
}

async function discoverCatalogue() {
    await fs.mkdir(CACHE_DIR, { recursive: true });

    let currentUrl = FIRST_PAGE_URL;
    let pageNumber = 1;

    const cataloguePages = [];
    const discoveredUrls = [];

    while (currentUrl && pageNumber <= 3) {
        const html = await fetchPage(
            currentUrl,
            pageNumber
        );

        cataloguePages.push(currentUrl);

        const bookUrls = extractBookUrls(
            html,
            currentUrl
        );

        discoveredUrls.push(...bookUrls);

        console.log(
            `Page ${pageNumber}: discovered ${bookUrls.length} books`
        );

        const nextUrl = findNextUrl(
            html,
            currentUrl
        );

        if (!nextUrl) {
            break;
        }

        pageNumber++;

        // Wait only before a real network request.
        // Cached pages do not need the delay.
        if (pageNumber <= 3) {
            const isCached = await isPageCached(pageNumber);

            if (!isCached) {
                await sleep(DELAY_MS);
            }
        }

        currentUrl = nextUrl;
    }

    const uniqueUrls = [...new Set(discoveredUrls)];

    console.log("");
    console.log(`catalogue_pages=${cataloguePages.length}`);
    console.log(`discovered=${discoveredUrls.length}`);
    console.log(`unique_urls=${uniqueUrls.length}`);

    return {
        cataloguePages,
        discoveredUrls,
        uniqueUrls
    };
}

discoverCatalogue().catch(error => {
    console.error("Discovery failed:", error.message);
    process.exit(1);
});