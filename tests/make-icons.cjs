'use strict';
/* One-shot: renders Carlo app icons (192 + 512) to PNG via headless canvas.
   NODE_PATH="$(npm root -g)" node tests/make-icons.cjs
*/
const path = require('node:path');
const fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('playwright-core')); }

(async () => {
  let browser;
  try { browser = await chromium.launch(); }
  catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
  const p = await browser.newPage();
  for (const size of [192, 512]) {
    const dataUrl = await p.evaluate(S => {
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d');
      const u = S / 132;                       // rat viewBox is 132 wide
      // taxi-yellow rounded square
      ctx.fillStyle = '#f7c500';
      ctx.beginPath();
      const r = S * 0.18;
      ctx.roundRect(0, 0, S, S, r);
      ctx.fill();
      ctx.clip();
      // black sign strip at top (clipped to the rounded square)
      ctx.fillStyle = '#0e0f11';
      ctx.fillRect(0, 0, S, S * 0.16);
      const x = S * 0.02, y = S * 0.16;
      function E(cx, cy, rx, ry, fill) {
        ctx.beginPath();
        ctx.ellipse(x + cx * u * 0.96, y + cy * u * 0.9, rx * u * 0.96, ry * u * 0.9, 0, 0, 6.29);
        ctx.fillStyle = fill; ctx.fill();
      }
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 14 * u, y + 66 * u * 0.9);
      ctx.quadraticCurveTo(x - 6 * u, y + 58 * u * 0.9, x + 6 * u, y + 42 * u * 0.9);
      ctx.strokeStyle = '#e8a0a8'; ctx.lineWidth = 4 * u; ctx.stroke();
      E(52, 60, 36, 23, '#5d636b');
      E(88, 47, 17, 17, '#5d636b');
      E(82, 30, 8, 8, '#5d636b'); E(82, 30, 4, 4, '#e8a0a8');
      E(94, 43, 2.6, 2.6, '#0e0f11');
      E(104.5, 50, 2.6, 2.6, '#e8a0a8');
      E(38, 82, 7, 4, '#3d4147'); E(64, 83, 7, 4, '#3d4147');
      ctx.beginPath();
      ctx.moveTo(x + 96 * u * 0.96, y + 58 * u * 0.9);
      ctx.lineTo(x + 128 * u * 0.96, y + 66 * u * 0.9);
      ctx.lineTo(x + 100 * u * 0.96, y + 80 * u * 0.9);
      ctx.closePath(); ctx.fillStyle = '#e8641f'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 96 * u * 0.96, y + 58 * u * 0.9);
      ctx.lineTo(x + 128 * u * 0.96, y + 66 * u * 0.9);
      ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 4 * u; ctx.stroke();
      E(106, 67, 2.4, 2.4, '#c72c1e'); E(112, 71, 2.4, 2.4, '#c72c1e');
      return c.toDataURL('image/png');
    }, size);
    const out = path.join(__dirname, '..', `icon-${size}.png`);
    fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote', out);
  }
  await browser.close();
})();
