const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:3000/';
  const out = path.join(__dirname, '..', 'screenshot.png');
  try {
    const browser = await puppeteer.launch({args: ['--no-sandbox','--disable-setuid-sandbox']});
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    await page.screenshot({ path: out, fullPage: true });
    await browser.close();
    console.log('Saved screenshot to', out);
  } catch (err) {
    console.error('Screenshot failed:', err.message || err);
    process.exit(2);
  }
})();
