// Export the brand PNGs from img/logo.svg with headless Chromium (Playwright):
//   img/icon-512.png, icon-192.png, icon-64.png, icon-32.png and img/og.png (1200×630: logo + H1).
// Run: npx -y -p playwright node scripts/brand.mjs   (or `npm run brand` with playwright installed)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const logo = readFileSync(root + 'img/logo.svg', 'utf8');
const font = (f) => 'data:font/woff2;base64,' + readFileSync(root + 'fonts/' + f).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();

for (const s of [512, 192, 64, 32]) {
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(`<html><body style="margin:0;background:transparent">${logo.replace('<svg ', `<svg style="display:block;width:${s}px;height:${s}px" `)}</body></html>`);
  await page.screenshot({ path: root + `img/icon-${s}.png`, omitBackground: true });
}

await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><head><style>
@font-face{font-family:F;src:url(${font('Fraunces.woff2')})}@font-face{font-family:F;font-style:italic;src:url(${font('Fraunces-Italic.woff2')})}
@font-face{font-family:I;src:url(${font('InstrumentSans.woff2')})}@font-face{font-family:M;src:url(${font('JetBrainsMono.woff2')})}
body{margin:0;width:1200px;height:630px;background:#12100d;color:#efe6d2;position:relative;overflow:hidden;font-family:I}
.g{position:absolute;inset:0;opacity:.05;background:repeating-linear-gradient(90deg,#c9a25a 0 1px,transparent 1px 10px)}
.l{position:absolute;right:-60px;top:65px;width:500px;height:500px;opacity:.95}
.l svg{width:100%;height:100%}
.t{position:absolute;left:80px;top:150px;width:700px}
.e{font:500 20px M;letter-spacing:.16em;color:#c9a25a;text-transform:uppercase}
h1{margin:26px 0 0;font:400 96px/.98 F;letter-spacing:-.025em}
h1 em{font-style:italic;color:#c9a25a}
.w{position:absolute;left:80px;bottom:64px;font:600 26px I;letter-spacing:.14em}.w i{font-style:normal;color:#c9a25a}
.s{position:absolute;right:80px;bottom:64px;font:500 18px M;letter-spacing:.14em;color:#d4483b;border:3px solid #d4483b;padding:9px 14px;transform:rotate(-6deg)}
</style></head><body><div class="g"></div><div class="l">${logo}</div>
<div class="t"><div class="e">The counter · Solana</div><h1>Size goes over the <em>counter</em>.</h1></div>
<div class="w">COUNTER<i>X</i></div><div class="s">STAMPED · 0.0 %</div></body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: root + 'img/og.png' });

// X / Twitter header, 1500×500. X lays the round avatar over the bottom-left (and crops top/bottom on some screens):
// keep the left ~420 px and the outer 60 px top/bottom free of anything important.
await page.setViewportSize({ width: 1500, height: 500 });
await page.setContent(`<html><head><style>
@font-face{font-family:F;src:url(${font('Fraunces.woff2')})}@font-face{font-family:F;font-style:italic;src:url(${font('Fraunces-Italic.woff2')})}
@font-face{font-family:I;src:url(${font('InstrumentSans.woff2')})}@font-face{font-family:M;src:url(${font('JetBrainsMono.woff2')})}
body{margin:0;width:1500px;height:500px;background:#12100d;color:#efe6d2;position:relative;overflow:hidden;font-family:I}
.g{position:absolute;inset:0;opacity:.045;background:repeating-linear-gradient(90deg,#c9a25a 0 1px,transparent 1px 10px),repeating-linear-gradient(0deg,#c9a25a 0 1px,transparent 1px 40px)}
.glow{position:absolute;left:520px;top:-200px;width:900px;height:900px;border-radius:50%;background:radial-gradient(closest-side,rgba(241,215,154,.13),rgba(201,162,90,.04) 55%,transparent 72%)}
.rule{position:absolute;left:470px;right:80px;top:356px;height:1px;background:linear-gradient(90deg,#c9a25a,#8f6a2c 45%,rgba(240,225,190,.1))}
.t{position:absolute;left:470px;top:104px}
.e{font:500 17px M;letter-spacing:.18em;color:#c9a25a;text-transform:uppercase}
h1{margin:20px 0 0;font:400 84px/.98 F;letter-spacing:-.025em}
h1 em{font-style:italic;color:#c9a25a}
.m{position:absolute;left:470px;top:384px;display:flex;gap:28px;font:500 15px M;letter-spacing:.12em;color:#7d735f}
.m b{color:#efe6d2;font-weight:500}.m i{font-style:normal;color:#c9a25a}
.r{position:absolute;right:86px;top:96px;width:236px;background:#efe6d2;color:#1d1913;padding:16px 18px 34px;transform:rotate(2.5deg);box-shadow:0 30px 60px -20px rgba(0,0,0,.8);
 -webkit-mask:linear-gradient(#000 0 0) top/100% calc(100% - 9px) no-repeat,conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/18px 9px repeat-x}
.r .h{display:flex;justify-content:space-between;font:500 11px M;letter-spacing:.1em;color:#5e5444;padding-bottom:10px;border-bottom:1px dashed rgba(29,25,19,.35)}
.r .l{margin-top:12px;font:italic 500 28px/1 F}.r dl{margin:14px 0 0;padding-top:12px;border-top:1px dashed rgba(29,25,19,.35)}
.r dt{font:500 10.5px I;letter-spacing:.08em;text-transform:uppercase;color:#5e5444}.r dd{margin:2px 0 10px;font:500 17px M}
.s{position:absolute;right:120px;top:352px;font:600 17px M;letter-spacing:.14em;color:#d4483b;border:3px solid #d4483b;box-shadow:inset 0 0 0 2px #efe6d2,inset 0 0 0 4px #d4483b;padding:10px 15px 9px;transform:rotate(-7deg);background:rgba(239,230,210,.9)}
</style></head><body><div class="g"></div><div class="glow"></div>
<div class="t"><div class="e">The counter · Solana</div><h1>Size goes over<br>the <em>counter</em>.</h1></div>
<div class="rule"></div>
<div class="m"><span><b>COUNTER</b><i>X</i></span><span>$COUNTERX</span><span>BOTH LEGS OR NEITHER</span></div>
<div class="r"><div class="h"><span>RECEIPT</span><span>No. 1011</span></div><div class="l">Seller</div>
<dl><dt>hands over</dt><dd>5.00 % of the bag</dd><dt>floor</dt><dd style="color:#b23a2f">−74.6 %</dd><dt>counter</dt><dd>0.0 % · one tx</dd></dl></div>
<div class="s">STAMPED · 0.0 %</div></body></html>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: root + 'img/x-header.png' });
await browser.close();
console.log('brand: icons, og and x-header written');
