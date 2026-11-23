/* Headless smoke test + static export generator for the functional nav diagram. */
const { chromium } = require('/home/z/cms/tools/nav-diagram/node_modules/playwright-core');
const path = require('path');
const fs = require('fs');

const EXE = '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const DIR = '/home/z/cms/docs/diagrams/student-web-nav-functional';
const URL = 'file://' + path.join(DIR, 'index.html');

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--font-render-hinting=none', '--force-color-profile=srgb'] });

  // ---------- 1) interactive smoke ----------
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(700);

  const smoke = await page.evaluate(() => {
    const r = {};
    r.nodes = document.querySelectorAll('.node').length;
    r.edges = document.querySelectorAll('.edge').length;
    r.lanes = document.querySelectorAll('svg > g:first-child rect').length;
    r.legend = !!document.getElementById('legend');
    r.stats = document.getElementById('stats-chip').textContent;
    return r;
  });
  console.log('SMOKE:', JSON.stringify(smoke));

  // filter interactions
  await page.click('.frow[data-class="legacy"] input');
  const afterLegacyOff = await page.evaluate(() => document.querySelectorAll('.node.dimmed').length);
  console.log('legacy filter off → dimmed nodes:', afterLegacyOff);
  await page.click('.frow[data-class="legacy"] input');

  // red-only mode
  await page.click('#btn-red');
  const redOnly = await page.evaluate(() => document.getElementById('stats-chip').textContent);
  console.log('RED-only stats:', redOnly);
  await page.click('#btn-red');

  // study mode
  await page.click('#btn-study');
  const studyOnly = await page.evaluate(() => document.getElementById('stats-chip').textContent);
  console.log('Study-only stats:', studyOnly);
  await page.click('#btn-study');

  // search
  await page.fill('#search-input', 'المكتبة');
  await page.waitForTimeout(400);
  const searchState = await page.evaluate(() => ({
    count: document.getElementById('search-count').textContent,
    panelOpen: document.getElementById('detail').classList.contains('open'),
    title: (document.querySelector('#detail h2') || {}).textContent || ''
  }));
  console.log('SEARCH المكتبة:', JSON.stringify(searchState));
  await page.fill('#search-input', '');
  await page.waitForTimeout(300);

  // node click → detail with edges
  await page.click('.node[data-id="activate-code"]');
  await page.waitForTimeout(300);
  const detail = await page.evaluate(() => ({
    open: document.getElementById('detail').classList.contains('open'),
    incoming: document.querySelectorAll('#detail h4')[0].textContent,
    outgoing: document.querySelectorAll('#detail h4')[1].textContent
  }));
  console.log('DETAIL activate-code:', JSON.stringify(detail));

  // keyboard esc
  await page.keyboard.press('Escape');
  const escClosed = await page.evaluate(() => !document.getElementById('detail').classList.contains('open'));
  console.log('ESC closes panel:', escClosed);

  console.log('JS errors:', errors.length ? errors : 'NONE');

  // overlap check: bounding boxes of visible node rects must not intersect
  const overlaps = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('.node:not(.dimmed)')].map((g) => {
      const m = g.getAttribute('transform').match(/translate\(([\d.]+),([\d.]+)\)/);
      const w = parseFloat(g.querySelector('rect').getAttribute('width'));
      return { x: +m[1], y: +m[2], w, h: 58 };
    });
    let n = 0;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) n++;
    }
    return n;
  });
  console.log('node overlaps on default view:', overlaps);

  // ---------- 2) static export ----------
  const sp = await browser.newPage({ viewport: { width: 1700, height: 1200 } });
  await sp.goto(URL + '?static=1');
  await sp.waitForTimeout(800);
  const svgStr = await sp.evaluate(() => window.__exportSVG());
  fs.writeFileSync(path.join(DIR, 'graph.svg'), svgStr);
  console.log('graph.svg written:', svgStr.length, 'bytes');

  // raster: natural-size render, element screenshot at 2x device scale
  const dims = await sp.evaluate(() => window.__LAYOUT);
  const sp2 = await browser.newPage({ viewport: { width: Math.ceil(dims.W) + 4, height: Math.ceil(dims.H) + 4 }, deviceScaleFactor: 2 });
  await sp2.goto(URL + '?static=1');
  await sp2.waitForTimeout(900);
  const elh = await sp2.$('#graph-svg');
  await elh.screenshot({ path: path.join(DIR, 'graph.png') });
  console.log('graph.png written (2x of', Math.ceil(dims.W) + 'x' + Math.ceil(dims.H) + ')');

  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
