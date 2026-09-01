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

## Evidence

### robots.txt Request

The target's `robots.txt` URL returned a 404 response.

![robots.txt 404](evidence/robots-404.png)


## Stage 1 – Fetch and Cache

The scraper fetches the first catalogue page from:

https://books.toscrape.com/catalogue/page-1.html

The request uses a descriptive User-Agent and checks the HTTP response status before processing the response.

The returned HTML is cached locally as:

`cache/page-1.html`

The cached file is excluded from Git using `.gitignore`.

### Evidence

![Stage 1 Fetch](evidence/stage1-fetch.png)