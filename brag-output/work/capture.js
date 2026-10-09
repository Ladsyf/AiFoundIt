// Frame capture: drives installed Edge via puppeteer-core.
// Usage: node capture.js [t1 t2 ...]   — captures specific times to stills/
//        node capture.js             — captures all 1800 frames to frames/
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///' + path.resolve(__dirname, 'player.html').replace(/\\/g, '/');
const FPS = 30, DUR = 60;

(async () => {
  const stills = process.argv.slice(2).map(Number);
  const dir = path.join(__dirname, stills.length ? 'stills' : 'frames');
  fs.mkdirSync(dir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--disable-lcd-text', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  const grab = async (t, i) => {
    await page.evaluate((tt) => window.render(tt), t);
    const name = stills.length
      ? path.join(dir, `t${String(t).replace('.', '_')}.png`)
      : path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    await page.screenshot(stills.length ? { path: name, type: 'png' } : { path: name, type: 'jpeg', quality: 92 });
  };

  if (stills.length) {
    for (const t of stills) { await grab(t); console.log('still', t); }
  } else {
    const N = FPS * DUR;
    const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      await grab(i / FPS, i);
      if (i % 120 === 0) console.log(`${i}/${N} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
  await browser.close();
})();
