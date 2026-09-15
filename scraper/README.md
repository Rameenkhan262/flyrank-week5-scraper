# Books to Scrape – Scraper

## Target Classification

The target website for this assignment is:

https://books.toscrape.com/

Books to Scrape is a practice catalogue website containing book listings that can be collected for this scraping exercise.

### Target Type

- HTML catalogue website
- Book listing pages
- Paginated catalogue
- Product/book detail pages
- The scraper will collect structured information from the catalogue pages.

### Robots.txt Check

The following URL was requested once before starting the scraper:

https://books.toscrape.com/robots.txt

Result:

**404 Not Found**

The target did not provide a `robots.txt` file at this location, so no robots.txt rules were available to interpret from this request.

### Scraping Scope

The scraper will only access the assigned target:

https://books.toscrape.com/

No unrelated websites or targets will be accessed.

## Running the Scraper

Install dependencies and run the scraper with:

```text
npm install
node src/index.js
```

The scraper follows these politeness rules:

- Uses the descriptive User-Agent `FlyRankInternship-A9/1.0`.
- Waits at least 500 ms between requests.
- Uses a request timeout to avoid hanging indefinitely.
- Checks HTTP response status before processing a page.
- Retries a timeout or HTTP 5xx response once.
- Does not retry HTTP 403 or 404 responses.
- Uses the local cache during development to avoid repeatedly requesting the same pages.


## Evidence

### robots.txt Request

The target's `robots.txt` URL returned a 404 response.

![robots.txt 404](evidence/robots-404.png)


## Stage 1 – Fetch and Cache

The scraper fetches the first catalogue page from:

https://books.toscrape.com/catalogue/page-1.html

The request uses a descriptive User-Agent and checks the HTTP response status before processing the response.

The returned HTML is cached locally as:

`cache/catalogue-page-1.html`

The cached file is excluded from Git using `.gitignore`.

### Evidence

![Stage 1 Fetch](evidence/stage1-fetch.png)

## Stage 2 – Catalogue Discovery

The scraper parses the catalogue pages using Cheerio and follows the
website's own "Next" pagination link.

Book links are discovered from the first three catalogue pages.
Relative links are converted to absolute URLs using the `URL` API.

Duplicate URLs are removed before continuing.

### Results

```text
catalogue_pages=3
discovered=60
unique_urls=60
```


## Stage 3 – Extract Book Details

The scraper visits each of the 60 unique book detail pages discovered
during Stage 2.

Each detail page is cached locally and parsed using Cheerio.

The raw record contains:

- title
- product_url
- price_text
- availability_text
- rating_text
- description
- source_page
- fetched_at
- upc

The scraper successfully extracted all 60 book detail pages.

### Results

![Stage 3](evidence/stage3-details_1.png)

![Stage 3](evidence/stage3-details_2.png)

![Stage 3](evidence/stage3-details_3.png)


## Stage 4 – Normalize and Validate

The raw book records from Stage 3 are normalized into a consistent
schema and validated before being written to JSON.

Normalization includes:

- Converting GBP price text into a numeric `price_gbp` value
- Converting rating words into integers from 1 to 5
- Converting availability text into `in_stock` and `count`
- Preserving missing descriptions as `null`
- Ensuring product URLs are absolute HTTPS URLs
- Checking for duplicate product URLs

Validated records are written to `output/books.json`.

Validation errors are written to `output/errors.json`.

### Results

![Stage 4](evidence/stage4-validation.png)


## Stage 5 – Failure Handling and Run Reporting

The scraper handles individual page failures without terminating the
entire run.

### Failure Handling

- HTTP 5xx errors are retried once.
- Request timeouts are retried once.
- HTTP 403 and 404 errors are not retried.
- If a page still fails, it is skipped and recorded in the run report.
- Remaining pages continue to be processed.

### Run Report

Each run generates:


![Stage 5 Failure Test](evidence/stage5-final-run.png)

## Ethics and Limitations

The scraper is limited to the assigned practice website and collects only the information required for the assignment.

If an official API exists for a target, it should be preferred over scraping. This scraper does not attempt to bypass logins, paywalls, access restrictions, or other blocks.

One limitation is that the target's `robots.txt` URL returned `404 Not Found`, so no robots.txt rules were available to interpret from that endpoint. The scraper therefore remains limited to the assigned target and the required catalogue/detail pages.
