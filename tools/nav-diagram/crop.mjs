/** Crop the SVG directly: render each region in its own viewport-sized page. */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const exe = '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const svg = readFileSync('/home/z/cms/docs/diagrams/student-web-navigation-graph.svg', 'utf8');

const regions = [
  ['auth', 0, 0, 900, 720],
  ['chrome-primary', 1700, 0, 1000, 1300],
  ['hub', 1150, 330, 750, 950],
  ['subjects', 700, 330, 700, 950],
  ['exams', 0, 650, 760, 620],
  ['bottom', 0, 1150, 2700, 510],
];

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
for (const [name, x, y, w, h] of regions) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.setContent(`<body style="margin:0;overflow:hidden"><div style="position:absolute;left:${-x}px;top:${-y}px;width:2520px;height:1660px">${svg}</div></body>`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `/tmp/crop-${name}.png` });
  await page.close();
  console.log('cropped', name);
}
await browser.close();
