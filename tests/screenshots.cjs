'use strict';
/* Renders every screen at iPhone size for a visual pass.
   NODE_PATH="$(npm root -g)" node tests/screenshots.cjs [outdir]
*/
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { baseState, exp } = require('./seed.js');

let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('playwright-core')); }

const INDEX = path.join(__dirname, '..', 'index.html');
const OUT = process.argv[2] || path.join(__dirname, 'shots');
const KEY = 'vianancial.v1';

const DEMO = baseState({
  expenses: [
    exp('d1', '2026-07-27', 600, 'eats', 'Coffee'),
    exp('d2', '2026-07-27', 1850, 'eats', 'Dumplings, obviously'),
    exp('d3', '2026-07-27', 2900, 'fun', 'Comedy cellar'),
    exp('d4', '2026-07-28', 400, 'eats', 'Pizza slice'),
    exp('d5', '2026-07-28', 2450, 'stuff', 'MoMA poster'),
    exp('d6', '2026-07-28', 950, 'eats', 'Halal cart', true),
    exp('d7', '2026-07-29', 1500, 'eats', 'Lunch'),
    exp('d8', '2026-07-29', 3200, 'fun', 'Rooftop thing'),
    exp('d9', '2026-07-30', 600, 'eats', 'Coffee'),
  ],
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(INDEX));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port + '/';
  let browser;
  try { browser = await chromium.launch(); }
  catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }

  async function shot(name, { scheme = 'light', now = '2026-07-30', seed = DEMO, go } = {}) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: scheme,
    });
    const p = await ctx.newPage();
    if (seed) await p.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(seed)]);
    await p.goto(origin);
    await p.evaluate(k => window.__test.setNow(k), now);
    if (go) await go(p);
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(OUT, name + '.png') });
    await ctx.close();
    console.log('  shot ' + name);
  }

  await shot('01-today-light');
  await shot('02-today-dark', { scheme: 'dark' });
  await shot('03-add-sheet', { go: p => p.click('[data-testid=fab]') });
  await shot('04-add-sheet-dark', { scheme: 'dark', go: p => p.click('[data-testid=fab]') });
  await shot('05-history', { go: p => p.click('[data-testid=tab-history]') });
  await shot('06-stats', { go: p => p.click('[data-testid=tab-stats]') });
  await shot('07-stats-dark', { scheme: 'dark', go: p => p.click('[data-testid=tab-stats]') });
  await shot('08-settings', { go: p => p.click('[data-testid=tab-settings]') });
  await shot('09-countdown', { now: '2026-07-25', seed: baseState() });
  await shot('10-wrapup', { now: '2026-08-10' });

  await browser.close();
  server.close();
  console.log('done → ' + OUT);
})();
