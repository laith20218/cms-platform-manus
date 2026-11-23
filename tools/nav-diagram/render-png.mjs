/** Render the navigation SVG to a 2x PNG via headless Chromium (proper Arabic shaping). */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const exe = '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const svg = resolve(process.argv[2] || '../../docs/diagrams/student-web-navigation-graph.svg', import.meta.url ? '.' : '.');
const png = resolve(process.argv[3] || '../../docs/diagrams/student-web-navigation-graph.png', '.');

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 2520, height: 1660 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(svg).href);
await page.waitForTimeout(600); // font settle
await page.screenshot({ path: png });
await browser.close();
console.log('written', png);
