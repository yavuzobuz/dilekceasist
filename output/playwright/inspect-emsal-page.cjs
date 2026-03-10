const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3000/emsal-karar-arama', { waitUntil: 'networkidle' });
  const data = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('input, textarea, button')).slice(0, 60);
    return els.map((el, i) => ({
      i,
      tag: el.tagName,
      type: el.getAttribute('type'),
      placeholder: el.getAttribute('placeholder'),
      text: (el.innerText || el.textContent || '').trim().slice(0, 120),
      name: el.getAttribute('name'),
      aria: el.getAttribute('aria-label')
    }));
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
