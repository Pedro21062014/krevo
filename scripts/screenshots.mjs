/**
 * Gera os screenshots usados no site e no README (precisa de Playwright).
 *
 *   cd apps/desktop && npm i -D playwright && npx playwright install chromium
 *   npx vite build && npx vite preview --port 4173 &
 *   node scripts/screenshots.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.KREVO_URL ?? "http://127.0.0.1:4173/";
const OUT = "site/assets";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1300);
await page.screenshot({ path: `${OUT}/app-home.png` });

await page.click('[data-action="use-template"]');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/app-editor.png` });

await page.click('[data-tab-panel="agent"]');
await page.fill("#agent-text", "lançamento do Krevo 1.0, fundo escuro, tipografia grande");
await page.click('[data-agent="send"]');
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/app-agent.png` });

await browser.close();
console.log("screenshots em", OUT);
