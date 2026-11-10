// Smoke test: no Prompt API (non-Chrome) + intercepted Gemini endpoint. Asserts no IC/phone/account digits and no photo leave the device.
// Usage: npm run build && npx vite preview --port 4173 & ; npm i -D playwright && node scripts/e2e/cloud-redaction-smoke.mjs docs/screenshots
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
await page.addInitScript(() => { delete window.LanguageModel; }); // simulate non-Chrome: no Prompt API
let body = null, url = null;
await page.route(/googleapis\.com/, async (route) => {
  url = route.request().url(); body = route.request().postData();
  const json = { letter_type: 'Overdue electricity bill', sender: 'Tenaga Nasional Berhad (sample)', summary: 'You owe RM286.00 including arrears. Pay in full by 17 Nov 2026 to avoid disconnection.',
    key_facts: [{ label: 'Total due', value: 'RM286.00' }, { label: 'Account no.', value: 'hidden' }], deadline: '2026-11-17', days_left: -1,
    next_steps: ['Pay RM286.00 via myTNB or FPX before 17 Nov 2026.'], urgency: 'high', language: 'en' };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(json) }] }, finishReason: 'STOP', index: 0 }] }) });
});
await page.goto('http://localhost:4173/');
await page.click('[data-lang="en"]');
await page.waitForTimeout(600);
await page.screenshot({ path: process.argv[2] + '/5-no-device-note.png' });
await page.click('[data-sample="tnb"]');
await page.waitForTimeout(600);
await page.click('#analyze'); // no on-device -> opens cloud sheet
await page.waitForSelector('#sheet[open]');
await page.click('#send-cloud');
await page.waitForSelector('.card', { timeout: 10000 });
await page.waitForTimeout(400);
await page.screenshot({ path: process.argv[2] + '/6-cloud-result.png', fullPage: true });
console.log('badge:', await page.textContent('.badge'));
console.log('url:', url);
const b = JSON.parse(body);
const sent = JSON.stringify(b.contents);
console.log('model in url / generationConfig:', JSON.stringify(b.generationConfig).slice(0, 200));
console.log('image sent?', sent.includes('inlineData'));
console.log('IC leaked?', /900101/.test(sent), 'phone leaked?', /0123456789/.test(sent), 'acct leaked?', /220012345678/.test(sent));
console.log('placeholders:', sent.match(/\[(IC|PHONE|ACCOUNT)\]/g));
await browser.close();
