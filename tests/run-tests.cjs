'use strict';
/* Behavioral suite for The Via-nancial District.
   Runs with the globally-installed playwright library — no local install:
     NODE_PATH="$(npm root -g)" node tests/run-tests.cjs
*/
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { baseState, exp, cumAllow, fmt$ } = require('./seed.js');

let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('playwright-core')); }

const INDEX = path.join(__dirname, '..', 'index.html');
const KEY = 'vianancial.v1';

async function launch() {
  try { return await chromium.launch(); }
  catch {
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
}

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(INDEX));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

let browser, server, origin;

async function page(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    colorScheme: opts.colorScheme || 'light',
  });
  const p = await ctx.newPage();
  if (opts.seed) {
    // guard so a reload doesn't re-seed and wipe what the app saved
    await p.addInitScript(([k, v]) => {
      if (!localStorage.getItem('__seeded')) {
        localStorage.setItem(k, v);
        localStorage.setItem('__seeded', '1');
      }
    }, [KEY, JSON.stringify(opts.seed)]);
  }
  if (opts.breakStorage) {
    await p.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  }
  await p.goto(origin);
  if (opts.now) await p.evaluate(k => window.__test.setNow(k), opts.now);
  return p;
}
const close = p => p.context().close();
const text = (p, sel) => p.locator(sel).first().innerText();
const S = baseState().settings;

/* seeded trip state used by several tests: $100 day1 + $150 day2, nothing day3 */
const SEED4 = baseState({
  expenses: [
    exp('e_a', '2026-07-27', 10000, 'eats', 'Big bagel energy'),
    exp('e_b', '2026-07-28', 15000, 'fun', 'Comedy cellar'),
  ],
});

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('1. first run before the trip → countdown + seeded defaults', async () => {
  const p = await page({ now: '2026-07-25' });
  assert.ok(await p.locator('[data-testid=countdown]').isVisible(), 'countdown visible');
  assert.match(await text(p, '[data-testid=countdown]'), /trip starts in/i);
  const stored = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  assert.equal(stored.settings.tripStart, '2026-07-27');
  assert.equal(stored.settings.tripEnd, '2026-08-09');
  assert.equal(stored.settings.totalBudgetCents, 180000);
  assert.equal(stored.settings.ddPerWeekCents, 3000);
  assert.equal(stored.schemaVersion, 2);
  assert.equal(stored.quickAdds.length, 8);
  await close(p);
});

test('2. quick-add flow: tap Slice → prefilled → save → headline drops $4', async () => {
  const p = await page({ seed: baseState(), now: '2026-07-28' });
  const before = await text(p, '[data-testid=headline-amount]');
  assert.equal(before, fmt$(cumAllow(S, 2)));                       // $257.14
  await p.click('[data-testid=fab]');
  await p.click('[data-testid=qa-tile]:has-text("Slice")');
  assert.equal(await p.inputValue('[data-testid=amount-input]'), '4');
  assert.equal(await p.inputValue('[data-testid=note-input]'), 'Pizza slice');
  await p.click('[data-testid=save-expense]');
  assert.equal(await text(p, '[data-testid=headline-amount]'), fmt$(cumAllow(S, 2) - 400));
  assert.match(await text(p, '[data-testid=expense-row]'), /Pizza slice/);
  await close(p);
});

test('3. persistence: reload keeps the expense and the math', async () => {
  const p = await page({ seed: baseState(), now: '2026-07-28' });
  await p.click('[data-testid=fab]');
  await p.click('[data-testid=qa-tile]:has-text("Coffee")');
  await p.click('[data-testid=save-expense]');
  await p.reload();
  await p.evaluate(k => window.__test.setNow(k), '2026-07-28');
  assert.equal(await text(p, '[data-testid=headline-amount]'), fmt$(cumAllow(S, 2) - 600));
  assert.match(await text(p, '[data-testid=expense-row]'), /Coffee/);
  await close(p);
});

test('4. rollover math is exact to the cent on day 4', async () => {
  const p = await page({ seed: SEED4, now: '2026-07-30' });
  assert.equal(await text(p, '[data-testid=headline-amount]'), fmt$(cumAllow(S, 4) - 25000)); // $264.29
  assert.equal(await text(p, '[data-testid=total-remaining]'), fmt$(155000));                 // $1,550.00
  assert.equal(await text(p, '[data-testid=days-left]'), '11');
  await close(p);
});

test('5. pace = floor(remaining / days incl today)', async () => {
  const p = await page({ seed: SEED4, now: '2026-07-30' });
  assert.equal(await text(p, '[data-testid=pace]'), fmt$(Math.floor(155000 / 11)) + '/d');    // $140.90/d
  await close(p);
});

test('6. dining dollars: separate pot, blocks overdraw, switch works', async () => {
  const p = await page({ seed: baseState(), now: '2026-07-28' });
  const before = await text(p, '[data-testid=headline-amount]');
  // $10 on dining dollars — the $1,800 must not move
  await p.click('[data-testid=fab]');
  await p.fill('[data-testid=amount-input]', '10');
  await p.click('[data-testid=dd-toggle]');
  await p.click('[data-testid=save-expense]');
  assert.equal(await text(p, '[data-testid=headline-amount]'), before);
  assert.match(await text(p, '[data-testid=dd-chip]'), /\$20\.00/);
  // $25 dining-dollar attempt: only $20 left → blocked, then switch to real budget
  await p.click('[data-testid=fab]');
  await p.fill('[data-testid=amount-input]', '25');
  await p.click('[data-testid=dd-toggle]');
  await p.click('[data-testid=save-expense]');
  assert.match(await text(p, '[data-testid=sheet-err]'), /dining dollars/i);
  await p.click('[data-testid=dd-switch]');
  assert.equal(await text(p, '[data-testid=headline-amount]'), fmt$(cumAllow(S, 2) - 2500));
  assert.match(await text(p, '[data-testid=dd-chip]'), /\$20\.00/);
  await close(p);
});

test('7. edit raises the math; delete + undo restores it', async () => {
  const p = await page({ seed: SEED4, now: '2026-07-30' });
  await p.click('[data-testid=tab-history]');
  await p.click('[data-testid=expense-row]:has-text("Big bagel energy")');
  await p.fill('[data-testid=amount-input]', '50');
  await p.click('[data-testid=save-expense]');
  await p.click('[data-testid=tab-today]');
  assert.equal(await text(p, '[data-testid=total-remaining]'), fmt$(160000));
  assert.equal(await text(p, '[data-testid=headline-amount]'), fmt$(cumAllow(S, 4) - 20000));
  // delete, then undo from the toast
  await p.click('[data-testid=tab-history]');
  await p.click('[data-testid=expense-row]:has-text("Big bagel energy")');
  await p.click('[data-testid=delete-expense]');
  await p.click('#toast-zone button');
  await p.click('[data-testid=tab-today]');
  assert.equal(await text(p, '[data-testid=total-remaining]'), fmt$(160000));
  await close(p);
});

test('8. export → wipe → paste-import round-trip is lossless', async () => {
  const p = await page({ seed: SEED4, now: '2026-07-30' });
  const backup = await p.evaluate(() => JSON.stringify(window.__test.getState()));
  await close(p);
  const p2 = await page({ now: '2026-07-30' });                    // fresh, empty
  await p2.click('[data-testid=tab-settings]');
  await p2.fill('[data-testid=import-text]', backup);
  await p2.click('[data-testid=import-check]');
  assert.match(await text(p2, '[data-testid=import-preview]'), /2 expenses/);
  await p2.click('[data-testid=import-confirm]');
  const st = await p2.evaluate(() => window.__test.getState());
  assert.equal(st.expenses.length, 2);
  assert.equal(st.expenses[0].note, 'Big bagel energy');
  await p2.click('[data-testid=tab-today]');
  assert.equal(await text(p2, '[data-testid=total-remaining]'), fmt$(155000));
  await close(p2);
});

test('9. garbage import rejected; script in a note stays inert text', async () => {
  const p = await page({ seed: SEED4, now: '2026-07-30' });
  await p.click('[data-testid=tab-settings]');
  await p.fill('[data-testid=import-text]', '{"lol":1}');
  await p.click('[data-testid=import-check]');
  assert.ok(await p.locator('[data-testid=import-error]').isVisible());
  assert.equal((await p.evaluate(() => window.__test.getState())).expenses.length, 2, 'state untouched');
  // XSS-shaped note through the normal add flow
  await p.click('[data-testid=fab]');
  await p.fill('[data-testid=amount-input]', '5');
  await p.fill('[data-testid=note-input]', '<img src=x onerror="window.xss=1">');
  await p.click('[data-testid=save-expense]');
  await p.click('[data-testid=tab-history]');
  assert.equal(await p.evaluate(() => window.xss), undefined, 'no script execution');
  assert.match(await text(p, '[data-testid=expense-row]'), /<img src=x/);
  await close(p);
});

test('10. blowing the whole budget: negative red headline, rat notices', async () => {
  const seed = baseState({ expenses: [exp('e_x', '2026-07-27', 200000, 'stuff', 'A regrettable jacket')] });
  const p = await page({ seed, now: '2026-07-28' });
  const headline = p.locator('[data-testid=headline-amount]');
  assert.equal(await headline.innerText(), fmt$(cumAllow(S, 2) - 200000));
  assert.match(await headline.getAttribute('class'), /over/);
  assert.match(await text(p, '[data-testid=total-remaining]'), /−/);
  const line = await text(p, '[data-testid=rat-line]');
  assert.doesNotMatch(line, /thriving|Distinguished/i, 'not a flush-tier line');
  await close(p);
});

test('11. trip facts are hardcoded: no date/budget inputs, tools remain', async () => {
  const p = await page({ seed: SEED4, now: '2026-07-30' });
  await p.click('[data-testid=tab-settings]');
  assert.equal(await p.locator('[data-testid=set-start]').count(), 0, 'no start-date input');
  assert.equal(await p.locator('[data-testid=set-end]').count(), 0, 'no end-date input');
  assert.equal(await p.locator('[data-testid=set-budget]').count(), 0, 'no budget input');
  assert.equal(await p.locator('[data-testid=set-dd]').count(), 0, 'no dining-dollars input');
  assert.match(await text(p, '#screen'), /\$1,800\.00/);
  assert.ok(await p.locator('[data-testid=export-json]').isVisible(), 'backups still there');
  assert.ok(await p.locator('[data-testid=qa-add]').isVisible(), 'quick-add manager still there');
  await close(p);
});

test('12. off-range expense clamps into day 1; day after trip → wrap-up', async () => {
  const seed = baseState({ expenses: [exp('e_pre', '2026-07-20', 1000, 'stuff', 'Early MetroCard')] });
  const p = await page({ seed, now: '2026-07-27' });
  assert.equal(await text(p, '[data-testid=headline-amount]'), fmt$(cumAllow(S, 1) - 1000));
  await p.click('[data-testid=tab-history]');
  assert.match(await text(p, '.receipt'), /PRE-GAME/);
  await p.evaluate(() => window.__test.setNow('2026-08-10'));
  await p.click('[data-testid=tab-today]');
  assert.ok(await p.locator('[data-testid=wrapup]').isVisible());
  assert.match(await text(p, '[data-testid=wrapup]'), /\$10\.00/);
  await close(p);
});

test('13. storage broken → warning banner + fully usable in-memory', async () => {
  const p = await page({ breakStorage: true, now: '2026-07-28' });
  assert.ok(await p.locator('[data-testid=storage-banner]').isVisible());
  await p.click('[data-testid=fab]');
  await p.fill('[data-testid=amount-input]', '5');
  await p.click('[data-testid=save-expense]');
  assert.equal(await text(p, '[data-testid=headline-amount]'), fmt$(cumAllow(S, 2) - 500));
  await close(p);
});

test('14. newer-schema data → read-only; destructive actions are inert', async () => {
  const newer = { ...baseState({ expenses: [exp('e_a', '2026-07-27', 1000, 'eats', 'Bagel')] }), schemaVersion: 99 };
  const p = await page({ seed: newer, now: '2026-07-28' });
  assert.ok(await p.locator('[data-testid=readonly-banner]').isVisible());
  await p.click('[data-testid=tab-history]');
  await p.click('[data-testid=expense-row]');
  await p.click('[data-testid=delete-expense]');
  const st = await p.evaluate(() => window.__test.getState());
  assert.equal(st.expenses.length, 1, 'delete did not mutate in-memory state');
  const stored = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  assert.equal(stored.schemaVersion, 99, 'newer data untouched');
  assert.equal(stored.expenses.length, 1);
  await close(p);
});

test('15. both themes render distinct, legible surfaces', async () => {
  const light = await page({ seed: SEED4, now: '2026-07-30', colorScheme: 'light' });
  const dark = await page({ seed: SEED4, now: '2026-07-30', colorScheme: 'dark' });
  const bg = pg => pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const ink = pg => pg.evaluate(() =>
    getComputedStyle(document.querySelector('[data-testid=headline-amount]')).color);
  assert.notEqual(await bg(light), await bg(dark), 'backgrounds differ per theme');
  for (const pg of [light, dark]) {
    assert.doesNotMatch(await ink(pg), /rgba?\(0, 0, 0, 0\)/, 'headline ink is not transparent');
  }
  await close(light); await close(dark);
});

test('16. two quick deletes: each Undo restores its own expense', async () => {
  const p = await page({ seed: SEED4, now: '2026-07-30' });
  await p.click('[data-testid=tab-history]');
  await p.click('[data-testid=expense-row]:has-text("Big bagel energy")');
  await p.click('[data-testid=delete-expense]');
  await p.click('[data-testid=expense-row]:has-text("Comedy cellar")');
  await p.click('[data-testid=delete-expense]');
  assert.equal(await p.locator('#toast-zone button').count(), 2, 'two stacked undo toasts');
  await p.locator('#toast-zone button').first().click();          // undo the FIRST delete
  let st = await p.evaluate(() => window.__test.getState());
  assert.ok(st.expenses.some(e => e.note === 'Big bagel energy'), 'first undo restored the bagel');
  await p.locator('#toast-zone button').first().click();          // remaining undo
  st = await p.evaluate(() => window.__test.getState());
  assert.equal(st.expenses.length, 2, 'both expenses restored');
  assert.ok(st.expenses.some(e => e.note === 'Comedy cellar'));
  await close(p);
});

test('17. a second tab adopts saves from the first (no clobber)', async () => {
  const p = await page({ seed: baseState(), now: '2026-07-28' });
  const p2 = await p.context().newPage();
  await p2.goto(origin);
  await p2.evaluate(k => window.__test.setNow(k), '2026-07-28');
  await p.click('[data-testid=fab]');
  await p.fill('[data-testid=amount-input]', '7');
  await p.click('[data-testid=save-expense]');
  await p2.waitForTimeout(400);
  await p2.evaluate(k => window.__test.setNow(k), '2026-07-28'); // re-render p2
  assert.equal(await text(p2, '[data-testid=headline-amount]'), fmt$(cumAllow(S, 2) - 700));
  await close(p);
});

test('18. reset writes a .bak that "Restore last automatic backup" recovers', async () => {
  const p = await page({ seed: SEED4, now: '2026-07-30' });
  await p.click('[data-testid=tab-settings]');
  await p.click('[data-testid=reset-all]');
  await p.click('[data-testid=reset-all]');                       // confirm tap
  let st = await p.evaluate(() => window.__test.getState());
  assert.equal(st.expenses.length, 0, 'reset cleared expenses');
  await p.click('[data-testid=restore-bak]');
  assert.match(await text(p, '[data-testid=import-preview]'), /2 expenses/);
  await p.click('[data-testid=import-confirm]');
  st = await p.evaluate(() => window.__test.getState());
  assert.equal(st.expenses.length, 2, 'backup restored both expenses');
  await close(p);
});

test('19. sub-dollar amounts typed as ".75" are valid money', async () => {
  const p = await page({ seed: baseState(), now: '2026-07-28' });
  await p.click('[data-testid=fab]');
  await p.fill('[data-testid=amount-input]', '.75');
  await p.click('[data-testid=save-expense]');
  assert.equal(await text(p, '[data-testid=headline-amount]'), fmt$(cumAllow(S, 2) - 75));
  await close(p);
});

test('20. dining dollars reset weekly; back-dated spends hit their own week', async () => {
  const seed = baseState({ expenses: [exp('dd1', '2026-07-28', 2500, 'eats', 'Halal cart', true)] });
  const p = await page({ seed, now: '2026-08-03' });               // first day of week 2
  const chip = await text(p, '[data-testid=dd-chip]');
  assert.match(chip, /week 2/i, 'chip shows current week');
  assert.match(chip, /\$30\.00/, 'fresh weekly pot despite $25 spent in week 1');
  // $28 dated Aug 4 (week 2, $30 available) saves fine
  await p.click('[data-testid=fab]');
  await p.fill('[data-testid=amount-input]', '28');
  await p.fill('[data-testid=date-input]', '2026-08-04');
  await p.click('[data-testid=dd-toggle]');
  await p.click('[data-testid=save-expense]');
  let st = await p.evaluate(() => window.__test.getState());
  assert.equal(st.expenses.filter(e => e.diningDollars).length, 2);
  // $28 back-dated to Jul 29 (week 1 has only $5 left) is blocked
  await p.click('[data-testid=fab]');
  await p.fill('[data-testid=amount-input]', '28');
  await p.fill('[data-testid=date-input]', '2026-07-29');
  await p.click('[data-testid=dd-toggle]');
  await p.click('[data-testid=save-expense]');
  assert.match(await text(p, '[data-testid=sheet-err]'), /\$5\.00 left in week 1/);
  await close(p);
});

test('21. v1 data on the phone migrates to v2 with a .bak of the original', async () => {
  const v1 = JSON.parse(JSON.stringify(baseState({
    expenses: [exp('e_a', '2026-07-27', 10000, 'eats', 'Big bagel energy')],
  })));
  v1.schemaVersion = 1;
  delete v1.settings.ddPerWeekCents;
  v1.settings.diningDollarsStartCents = 3000;
  const p = await page({ seed: v1, now: '2026-07-28' });
  const stored = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  assert.equal(stored.schemaVersion, 2, 'migrated to v2');
  assert.equal(stored.settings.ddPerWeekCents, 3000);
  assert.ok(!('diningDollarsStartCents' in stored.settings), 'old field removed');
  assert.equal(stored.expenses.length, 1, 'expenses intact');
  const bak = await p.evaluate(k => JSON.parse(localStorage.getItem(k + '.bak')), KEY);
  assert.equal(bak.schemaVersion, 1, '.bak preserves the pre-migration original');
  assert.match(await text(p, '[data-testid=dd-chip]'), /week 1/i, 'app renders normally post-migration');
  await close(p);
});

(async () => {
  browser = await launch();
  server = await serve();
  origin = 'http://127.0.0.1:' + server.address().port + '/';
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('  PASS  ' + t.name);
    } catch (err) {
      failed++;
      console.error('  FAIL  ' + t.name + '\n        ' + String(err.message).split('\n').join('\n        '));
    }
  }
  await browser.close();
  server.close();
  console.log(failed === 0 ? '\nAll ' + tests.length + ' tests passed. The rat approves.' : '\n' + failed + ' of ' + tests.length + ' tests failed.');
  process.exit(failed === 0 ? 0 : 1);
})();
