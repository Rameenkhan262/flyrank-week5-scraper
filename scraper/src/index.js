const fs = require("fs/promises");
const path = require("path");

const URL = "https://books.toscrape.com/catalogue/page-1.html";

async function fetchAndCache() {
    try {
        console.log(`Fetching: ${URL}`);

        const response = await fetch(URL, {
            headers: {
                "User-Agent": "FlyRank-PoliteScraper/1.0"
            }
        });

        console.log(`Status: ${response.status}`);

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const html = await response.text();

        const cacheDirectory = path.join(__dirname, "../cache");
        const cacheFile = path.join(cacheDirectory, "page-1.html");

        await fs.mkdir(cacheDirectory, { recursive: true });
        await fs.writeFile(cacheFile, html, "utf8");

        console.log(`Cached HTML: ${cacheFile}`);
        console.log(`HTML size: ${html.length} characters`);
    } catch (error) {
        console.error("Fetch failed:", error.message);
        process.exit(1);
    }
}

fetchAndCache();