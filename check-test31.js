const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('file:///' + __dirname.replace(/\\/g, '/') + '/test31.html');
  await page.waitForTimeout(500);
  
  await browser.close();
})();
