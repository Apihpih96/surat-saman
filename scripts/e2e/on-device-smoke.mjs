// Smoke test: stubs Chrome's LanguageModel (Prompt API) so the REAL Firebase AI Logic on-device path runs.
// Usage: npm run build && npx vite preview --port 4173 & ; npm i -D playwright && node scripts/e2e/on-device-smoke.mjs docs/screenshots
import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
// Fake Chrome Prompt API so the REAL Firebase SDK on-device path runs end to end.
await page.addInitScript(() => {
  window.__prompts = [];
  window.LanguageModel = {
    availability: async (opts) => { window.__availOpts = opts; return 'available'; },
    create: async (opts) => ({
      prompt: async (msgs, promptOpts) => {
        window.__prompts.push({ msgs: JSON.stringify(msgs).slice(0, 400), hasConstraint: !!promptOpts?.responseConstraint, createOpts: JSON.stringify(opts).slice(0,200) });
        return JSON.stringify({
          letter_type: 'Notis saman trafik', sender: 'Polis Diraja Malaysia (contoh)',
          summary: 'Anda disaman kerana memandu 110 km/j dalam zon 90 km/j di Lebuhraya Contoh pada 28 Okt 2026. Kompaun RM300, tetapi hanya RM150 jika dibayar dalam 30 hari.',
          key_facts: [{ label: 'No. saman', value: 'KPP12345678901' }, { label: 'Kompaun', value: 'RM300 (RM150 jika bayar awal)' }, { label: 'Kesalahan', value: 'Seksyen 79(2) APJ 1987' }, { label: 'Kenderaan', value: 'WXX 0000' }],
          deadline: '2026-11-27', days_left: -1,
          next_steps: ['Bayar RM150 melalui MyBayar PDRM sebelum 27 Nov 2026.', 'Simpan resit bayaran.', 'Jika tidak bersetuju, hubungi pejabat trafik sebelum tarikh akhir.'],
          urgency: 'medium', language: 'ms' });
      },
      destroy() {},
    }),
  };
});
await page.goto('http://localhost:4173/');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/1-home.png`, fullPage: true });
await page.click('[data-sample="saman"]');
await page.waitForTimeout(800);
await page.click('#analyze');
await page.waitForSelector('.card', { timeout: 10000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/2-result.png`, fullPage: true });
console.log('badge:', await page.textContent('.badge'));
console.log('days:', await page.textContent('.days'));
console.log('prompts:', JSON.stringify(await page.evaluate(() => window.__prompts)));
await page.click('.card [data-action="cloud"]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/3-cloud-sheet.png` });
await page.click('[data-action="close-sheet"]');
await page.click('[data-lang="en"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/4-result-en-ui.png`, fullPage: true });
console.log(logs.join('\n'));
await browser.close();
