'use strict';
/* Shared fixtures + an independent reimplementation of the money math,
   so tests assert exact cents without trusting the app's own logic. */

const DAY_MS = 86400000;

function keyToUTC(k) {
  const [y, m, d] = k.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function diffDays(a, b) { return Math.round((keyToUTC(b) - keyToUTC(a)) / DAY_MS); }

function baseState(overrides = {}) {
  return {
    schemaVersion: 2,
    settings: {
      tripStart: '2026-07-27',
      tripEnd: '2026-08-09',
      totalBudgetCents: 180000,
      ddPerWeekCents: 3000,
      name: 'Via',
      ...(overrides.settings || {}),
    },
    expenses: overrides.expenses || [],
    quickAdds: overrides.quickAdds || defaultQuickAdds(),
    meta: { createdAt: 1753600000000, lastSavedAt: 1753600000000 },
  };
}

function defaultQuickAdds() {
  let n = 0;
  const qa = (emoji, label, amountCents, category, note) =>
    ({ id: 'qa_' + (n++), emoji, label, amountCents, category, note });
  return [
    qa('☕', 'Coffee', 600, 'eats', 'Coffee'),
    qa('🍕', 'Slice', 400, 'eats', 'Pizza slice'),
    qa('🥯', 'Bodega run', 1200, 'eats', 'Bodega run'),
    qa('🥪', 'Lunch', 1500, 'eats', 'Lunch'),
    qa('🍜', 'Dinner out', 3000, 'eats', 'Dinner out'),
    qa('🍸', 'Going out', 2500, 'fun', 'Going out'),
    qa('🖼️', 'Museum', 2000, 'fun', 'Museum'),
    qa('🗽', 'Souvenir', 1500, 'stuff', 'Souvenir'),
  ];
}

function exp(id, date, amountCents, category, note, diningDollars = false) {
  return { id, amountCents, category, note, date, diningDollars, createdAt: keyToUTC(date) + 43200000 };
}

/* independent math: mirrors the app's documented formulas */
function tripDays(s) { return diffDays(s.tripStart, s.tripEnd) + 1; }
function clampKey(k, lo, hi) { return k < lo ? lo : (k > hi ? hi : k); }
function dayNum(s, k) { return diffDays(s.tripStart, clampKey(k, s.tripStart, s.tripEnd)) + 1; }
function cumAllow(s, n) { return Math.round(s.totalBudgetCents * n / tripDays(s)); }
function spentThrough(s, exps, k) {
  const cutoff = clampKey(k, s.tripStart, s.tripEnd);
  return exps.filter(e => !e.diningDollars)
    .filter(e => clampKey(e.date, s.tripStart, s.tripEnd) <= cutoff)
    .reduce((t, e) => t + e.amountCents, 0);
}
function fmt$(cents) {
  const neg = cents < 0, a = Math.abs(cents);
  return (neg ? '−$' : '$') + Math.floor(a / 100).toLocaleString('en-US') + '.' + String(a % 100).padStart(2, '0');
}

module.exports = { baseState, defaultQuickAdds, exp, tripDays, dayNum, cumAllow, spentThrough, fmt$, diffDays };
