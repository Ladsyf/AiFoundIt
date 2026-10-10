// node capture.js stills 3.2 12.5 ...   -> stills/t3_2.png ...
// node capture.js render [workers]      -> seg0.mp4 ... segN.mp4 (frames piped straight into ffmpeg)
const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = 'file:///' + path.resolve(__dirname, 'player.html').replace(/\\/g, '/');
const FPS = 30;
const FRAMES = 60 * FPS;
const POSTER = 17.4;

async function open() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--force-color-profile=srgb', '--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(PAGE, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(() => window.ready);
  const cdp = await page.createCDPSession();
  return { browser, page, cdp };
}

async function frame({ page, cdp }, t, format) {
  await page.evaluate((tt) => window.render(tt), t);
  const shot = await cdp.send('Page.captureScreenshot', format === 'png'
    ? { format: 'png' }
    : { format: 'jpeg', quality: 94, optimizeForSpeed: true });
  return Buffer.from(shot.data, 'base64');
}

async function stills(times) {
  const dir = path.join(__dirname, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  const s = await open();
  for (const t of times) {
    fs.writeFileSync(path.join(dir, `t${String(t).replace('.', '_')}.png`), await frame(s, t, 'png'));
  }
  await s.browser.close();
  console.log('stills', times.join(' '));
}

async function segment(k, from, to) {
  const out = path.join(__dirname, `seg${k}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${k} exited ${c}`)))));
  const s = await open();
  const t0 = Date.now();
  for (let i = from; i < to; i++) {
    const buf = await frame(s, i === 0 ? POSTER : i / FPS, 'jpeg');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((i - from) % 150 === 0) console.log(`seg${k} ${i - from}/${to - from} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await s.browser.close();
  await done;
}

(async () => {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'stills') return stills(rest.map(Number));
  const workers = Number(rest[0] || 4);
  const per = Math.ceil(FRAMES / workers);
  await Promise.all(Array.from({ length: workers }, (_, k) => segment(k, k * per, Math.min(FRAMES, (k + 1) * per))));
  fs.writeFileSync(path.join(__dirname, 'segments.txt'), Array.from({ length: workers }, (_, k) => `file 'seg${k}.mp4'`).join('\n') + '\n');
  console.log('segments done');
})().catch((e) => { console.error(e); process.exit(1); });
