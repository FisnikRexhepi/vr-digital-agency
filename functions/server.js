const puppeteer = require("puppeteer-core");
const CsvParser = require("json2csv").Parser;
const chromium = require("chrome-aws-lambda");
exports.handler = async function (event, ctx, callback) {
  const body = JSON.parse(event.body);
  const keyword = body.keyword;
  console.log(`Scraping URLs for keyword: ${keyword}`);
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath:
      process.env.CHROME_EXECUTABLE_PATH || (await chromium.executablePath),
    headless: true,
  });
  const page = await browser.newPage();
  const url = `https://www.google.com/search?q=${keyword}`;
  await page.goto(url);
  let urls = [];
  while (urls.length < 100) {
    const currentUrls = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      const urls = links.map((link) => link.href);
      const nonGoogleUrls = urls.filter((url) => {
        return (
          !url.includes("google.") &&
          !url.includes("webcache.googleusercontent.com")
        );
      });
      return nonGoogleUrls;
    });
    urls = [...urls, ...currentUrls];
    urls = Array.from(new Set(urls));
    const nextButton = await page.$("#pnnext");
    if (urls.length >= 100 || !nextButton) {
      break;
    }
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click("#pnnext"),
    ]);
  }
  const foundedUrl = urls.slice(0, 100).map((url) => ({ url }));
  const csvFields = ["Url"];
  const csvParser = new CsvParser({ csvFields });
  const csvData = csvParser.parse(foundedUrl);
  await browser.close();
  console.log(`Finished scraping URLs`);
  callback(null, {
    headers: {
      "Content-Type": "text/csv",
      "Content-disposition": "attachment' filename=urls.csv",
    },
    body: csvData,
    statusCode: 200,
  });
};