import { chromium } from 'playwright';
import fs from 'node:fs';

const svg = fs.readFileSync('/home/user/krevo/brand/krevo-mark.svg', 'utf8');
const out = '/home/user/krevo/apps/desktop/src-tauri/icons';
fs.mkdirSync(out, { recursive: true });

const sizes = { '32x32.png': 32, '128x128.png': 128, '128x128@2x.png': 256, 'icon.png': 512, 'Square150x150Logo.png': 150, 'Square44x44Logo.png': 44, 'StoreLogo.png': 50 };
const browser = await chromium.launch();
for (const [name, size] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="width:${size}px;height:${size}px;display:block" `)}</body>`);
  await page.screenshot({ path: `${out}/${name}`, omitBackground: true });
  await page.close();
}
// ícone grande para o site / README
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<body style="margin:0">${svg.replace('<svg ', '<svg style="width:1024px;height:1024px;display:block" ')}</body>`);
await page.screenshot({ path: '/home/user/krevo/brand/krevo-mark.png', omitBackground: true });
// logo horizontal (mark + wordmark)
const page2 = await browser.newPage({ viewport: { width: 1200, height: 320 } });
await page2.setContent(`<body style="margin:0;background:#0b0d14;display:flex;align-items:center;gap:36px;padding:48px;font-family:Inter,system-ui,sans-serif">
  ${svg.replace('<svg ', '<svg style="width:200px;height:200px" ')}
  <span style="color:#edeef5;font-size:132px;font-weight:750;letter-spacing:-6px">Krevo</span></body>`);
await page2.screenshot({ path: '/home/user/krevo/brand/krevo-logo.png' });
await browser.close();
console.log('icons ok');
