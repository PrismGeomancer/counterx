// CounterX · the teller window. One coin at a time: what 5 % of supply does on the floor vs at the counter, then the block crosses.
// Phases per coin: Quote → In the safe → Crossing → Stamped. One rAF clock drives everything; CSS animates transform/opacity only.
import { CFG, $, $$, esc, pct, sol, short, int, usd, hhmmUtc, reduced } from './core.js';
import { counterQuote } from './quote.js';
import { loadHeroCoins, loadHist, loadSnapshot } from './live.js';

const PHASES = [
  { k: 'quote', at: 0, word: 'Quote' },
  { k: 'safe', at: 0.22, word: 'In the safe' },
  { k: 'cross', at: 0.42, word: 'Crossing' },
  { k: 'stamp', at: 0.62, word: 'Stamped' },
];
const STEPS = [['QUOTE', 'what the floor would pay'], ['IN THE SAFE', 'tokens held by the program'], ['ONE STAMP', 'both legs, one instruction'], ['STAMPED', 'handed off the floor']];
const pad2 = (n) => String(n).padStart(2, '0');
const tok = (c) => short(c.bag && c.bag.tokens) + ' ' + (c.sym || '');

function template() {
  return `
  <div class="st-coin">
    <span class="ci"><img class="k-img" alt="" referrerpolicy="no-referrer" hidden><span class="cph k-ph">—</span></span>
    <a class="cn k-link" href="coins.html"><b class="k-sym">$—</b><span class="k-name">—</span></a>
    <dl class="kv">
      <div><dt>Market cap</dt><dd class="k-mc">—</dd></div>
      <div><dt>Vol 1h</dt><dd class="k-vol">—</dd></div>
      <div><dt>Market</dt><dd class="k-mkt">—</dd></div>
      <div><dt>Pool fee</dt><dd class="k-fee" title="Swap fee assumed in this floor quote">—</dd></div>
      <div><dt>1h</dt><dd class="k-ch">—</dd></div>
    </dl>
    <div class="st-rot"><button class="prev" type="button" aria-label="Previous coin">‹</button><span class="n num k-n">— / —</span><span class="pb" aria-hidden="true"><i></i></span><button class="next" type="button" aria-label="Next coin">›</button></div>
  </div>
  <div class="st-counter">
    <div class="rcpt seller">
      <div class="rh"><span>RECEIPT</span><span class="k-no">No. —</span></div>
      <div class="rl">Seller</div><div class="rw">holder · <span class="k-pct">5.00 %</span></div>
      <dl><dt>hands over</dt><dd class="k-s-give">—</dd><dt>gets</dt><dd class="k-s-get">—</dd></dl>
    </div>
    <div class="grille" aria-hidden="true"></div>
    <div class="safe">
      <div class="door"><img class="d" src="img/vault-door.webp" alt="" width="450" height="450"><img class="wheel" src="img/vault-wheel.webp" alt="" width="231" height="232"></div>
      <div class="cap"><b>THE SAFE</b><span>both legs or neither</span></div>
    </div>
    <div class="grille" aria-hidden="true"></div>
    <div class="rcpt buyer">
      <div class="rh"><span>RECEIPT</span><span class="k-no">No. —</span></div>
      <div class="rl">Buyer</div><div class="rw">any wallet</div>
      <dl><dt>hands over</dt><dd class="k-b-give">—</dd><dt>gets</dt><dd class="k-b-get">—</dd></dl>
    </div>
    <i class="cube tok" aria-hidden="true"></i><i class="cube solc" aria-hidden="true"></i>
    <div class="stamp" aria-hidden="true">STAMPED · 0.0&nbsp;%</div>
  </div>
  <div class="st-chart">
    <svg viewBox="0 0 640 200" preserveAspectRatio="none" aria-hidden="true"><g class="grid"></g><path class="hist"/><path class="ctr"/><path class="flr"/><line class="now" y1="0" y2="200"/></svg>
    <span class="tag-now">NOW</span>
    <div class="lab ctr-l"><b>AT THE COUNTER</b><span class="num"><em>0.0&nbsp;%</em> <span class="k-c-sol">—</span></span></div>
    <div class="lab flr-l"><b>ON THE FLOOR</b><span class="num"><em class="k-f-mv">—</em> <span class="k-f-sol">—</span></span></div>
  </div>
  <div class="st-state" aria-live="polite"><b class="k-word">Quote</b><span class="k-sub">—</span></div>
  <ol class="st-steps">${STEPS.map(([a, b], i) => `<li data-i="${i}"><b>${a}</b><span>${b}</span></li>`).join('')}</ol>
  <div class="st-note"><span class="k-src1">floor maths on live reserves</span><span class="k-src2">read from chain in your browser</span></div>`;
}

export function mountHero(stage, board) {
  if (!stage) return {};
  stage.innerHTML = template();
  const q = (s) => $(s, stage), set = (s, t) => { const el = q(s); if (el) el.textContent = t; };
  const bset = (s, t) => { const el = board && $(s, board); if (el) el.textContent = t; };
  const counter = q('.st-counter');
  let coins = [], i = 0, elapsed = 0, last = 0, phase = -1, paused = 0, raf = 0, mode = 'example';
  const RM = reduced(), ROT = CFG.rotateMs || 12000;

  // ---------- geometry: where the cubes travel (seller ↔ safe ↔ buyer centres) ----------
  function measure() {
    // cubes rest in the gap between each receipt and the safe (on the grille), so they never cover receipt text
    const r0 = counter.getBoundingClientRect(), s = q('.rcpt.seller').getBoundingClientRect(), b = q('.rcpt.buyer').getBoundingClientRect(), d = q('.safe .door').getBoundingClientRect();
    counter.style.setProperty('--xs', ((s.right + d.left) / 2 - r0.left) + 'px');
    counter.style.setProperty('--xv', (d.left + d.width / 2 - r0.left) + 'px');
    counter.style.setProperty('--xb', ((d.right + b.left) / 2 - r0.left) + 'px');
    counter.style.setProperty('--yv', (d.top - r0.top + d.height / 2) + 'px');
    counter.style.setProperty('--yb', (d.bottom - r0.top) + 'px');
    if (coins[i]) chart(coins[i]);
  }
  new ResizeObserver(measure).observe(counter);

  // ---------- one coin onto the stage ----------
  function fill(c) {
    const n = coins.length, ctr = counterQuote(c.bag && c.bag.valueSol, CFG.counterFeeBps || 100);
    const img = q('.k-img'), ph = q('.k-ph');
    if (c.img) { img.hidden = false; ph.hidden = true; img.src = c.img; img.onerror = () => { img.hidden = true; ph.hidden = false; }; } else { img.hidden = true; ph.hidden = false; }
    ph.textContent = (c.sym || '—').slice(0, 2);
    set('.k-sym', c.sym ? '$' + c.sym : '$—'); set('.k-name', c.name || '—');
    q('.k-link').href = c.mint ? 'coin.html#' + c.mint : 'coins.html';
    set('.k-mc', usd(c.mcUsd)); set('.k-vol', c.vol1h != null ? sol(c.vol1h, 1) + ' SOL' : '—');
    set('.k-mkt', c.market === 'pool' ? 'PumpSwap' : c.market === 'curve' ? 'Curve' : '—'); set('.k-fee', c.fr != null ? pct(c.fr * 100, 2) : '—');
    q('.k-ch').innerHTML = c.ch1h != null ? `<span class="${c.ch1h < 0 ? 'dn' : 'up'}">${pct(c.ch1h, 1, true)}</span>` : '—';
    set('.k-n', n ? `${pad2(i + 1)} / ${pad2(n)}` : '— / —');
    const no = 'No. ' + String(1000 + ((i * 37 + 11) % 9000)).padStart(4, '0');
    $$('.k-no', stage).forEach((el) => (el.textContent = no));
    set('.k-pct', pct(c.bag ? c.bag.pct : CFG.bagPct || 5, 2));
    set('.k-s-give', c.bag ? tok(c) : '—'); set('.k-s-get', ctr ? sol(ctr.net) + ' SOL' : '—');
    set('.k-b-give', c.bag ? sol(c.bag.valueSol) + ' SOL' : '—'); set('.k-b-get', c.bag ? tok(c) : '—');
    set('.k-c-sol', ctr ? sol(ctr.net) + ' SOL' : '—');
    set('.k-f-mv', c.pool ? pct(c.pool.move) : '—'); set('.k-f-sol', c.pool ? sol(c.pool.out) + ' SOL out' : '—');
    // outcome board (hero copy column)
    bset('.o-sym', c.sym ? '$' + c.sym : '—'); bset('.o-pct', pct(c.bag ? c.bag.pct : CFG.bagPct || 5, 2));
    bset('.o-tok', c.bag ? int(c.bag.tokens) + ' tokens' : '—');
    bset('.o-floor-w', 'one market sell, pool fee ' + (c.fr != null ? pct(c.fr * 100, 2) : '—'));
    bset('.o-floor-big', c.pool ? pct(c.pool.move) : '—'); bset('.o-floor-s', c.pool ? sol(c.pool.out) + ' SOL out' : '—');
    bset('.o-counter-s', ctr ? sol(ctr.net) + ' SOL net · fee ' + sol(ctr.feeSol) : '—');
    const diff = ctr && c.pool ? ctr.net - c.pool.out : null;
    bset('.o-diff', diff != null ? (diff >= 0 ? '+' : '−') + sol(Math.abs(diff)) + ' SOL' : '—');
    // where the numbers came from
    const src = c.src || mode;
    set('.k-src1', src === 'rpc' ? 'floor maths on live reserves' : src === 'dex' ? 'floor maths on DexScreener reserves' : src === 'snapshot' ? 'snapshot · ' + hhmmUtc(c.at) : 'example · no live data');
    set('.k-src2', src === 'rpc' ? 'read from chain in your browser' : src === 'dex' ? 'chain read unavailable' : src === 'snapshot' ? 'saved snapshot, not live' : 'example data');
    stage.dataset.src = src;
    chart(c, null);
    if (c.pair && !c.hist) loadHist(c.pair).then((h) => { if (h && coins[i] === c) { c.hist = h; chart(c); } });
    else if (c.hist) chart(c);
  }

  // ---------- the chart: last hour, then two futures from NOW: flat at the counter, the drop on the floor ----------
  function chart(c) {
    // narrow stages put NOW further left so the two labels have room
    const svg = q('.st-chart svg'), W = 640, H = 200, NOW = (stage.clientWidth < 560 ? 0.4 : 0.64) * W, top = 18, bot = H - 22;
    const hist = c.hist && c.hist.px && c.hist.px.length > 4 ? c.hist.px : null, px = c.px;
    const after = c.pool && c.pool.pxAfter != null ? c.pool.pxAfter : px != null && c.pool ? px * (1 + c.pool.move / 100) : null;
    const vals = [...(hist || []), px, after].filter((v) => v > 0);
    const hi = vals.length ? Math.max(...vals) : 1, lo = vals.length ? Math.min(...vals) : 0, span = hi - lo || hi || 1;
    const y = (v) => (bot - ((v - lo) / span) * (bot - top)).toFixed(1);
    $('.grid', svg).innerHTML = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${W}" y1="${(top + f * (bot - top)).toFixed(1)}" y2="${(top + f * (bot - top)).toFixed(1)}"/>`).join('');
    const yNow = px > 0 ? y(px) : (top + bot) / 2;
    if (hist) { const step = NOW / (hist.length - 1); $('.hist', svg).setAttribute('d', 'M' + hist.map((v, k) => `${(k * step).toFixed(1)} ${y(v)}`).join('L') + `L${NOW} ${yNow}`); }
    else $('.hist', svg).setAttribute('d', `M${NOW - 120} ${yNow}L${NOW} ${yNow}`);
    $('.ctr', svg).setAttribute('d', `M${NOW} ${yNow}L${W} ${yNow}`);
    const yA = after > 0 ? y(after) : bot;
    $('.flr', svg).setAttribute('d', `M${NOW} ${yNow}C${NOW + 26} ${yNow} ${NOW + 22} ${yA} ${NOW + 60} ${yA}L${W} ${yA}`);
    const now = $('.now', svg); now.setAttribute('x1', NOW); now.setAttribute('x2', NOW);
    // labels follow the lines (percent of the box)
    const box = q('.st-chart');
    box.style.setProperty('--now', (NOW / W) * 100 + '%');
    box.style.setProperty('--yc', (yNow / H) * 100 + '%');
    box.style.setProperty('--yf', (yA / H) * 100 + '%');
    // counter label sits above its line when there is room, else below; the floor label goes below its line unless it would fall off
    box.classList.toggle('c-below', yNow / H < 0.3);
    box.classList.toggle('f-above', yA / H > 0.62);
  }

  // ---------- the clock ----------
  function setPhase(p) {
    if (p === phase) return; phase = p;
    const P = PHASES[p], c = coins[i] || {};
    stage.classList.remove('p-quote', 'p-safe', 'p-cross', 'p-stamp'); stage.classList.add('p-' + P.k);
    set('.k-word', P.word);
    const sub = [
      c.pool ? `${pct(c.bag.pct, 2)} onto the floor: ${pct(c.pool.move)}` : 'what the floor would pay',
      c.bag ? `the program holds ${tok(c)}` : 'tokens held by the program',
      'both legs, one instruction',
      c.bag ? `seller +${sol(counterQuote(c.bag.valueSol, CFG.counterFeeBps || 100).net)} SOL · buyer +${tok(c)}` : 'handed off the floor',
    ][p];
    set('.k-sub', sub);
    $$('.st-steps li', stage).forEach((li, k) => { li.classList.toggle('on', k === p); li.classList.toggle('done', k < p); });
  }
  function go(k) {
    const n = Math.max(1, coins.length); i = ((k % n) + n) % n; elapsed = 0; phase = -1;
    counter.classList.add('reset'); stage.classList.remove('p-quote', 'p-safe', 'p-cross', 'p-stamp');
    fill(coins[i] || {}); measure();
    void counter.offsetWidth; counter.classList.remove('reset');
    setPhase(0);
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(100, t - last) : 0; last = t;
    if (!paused) elapsed += dt;
    const f = elapsed / ROT; let p = 0; for (let k = 0; k < PHASES.length; k++) if (f >= PHASES[k].at) p = k;
    setPhase(p);
    q('.pb i').style.transform = `scaleX(${Math.min(1, f).toFixed(4)})`;
    if (f >= 1 && coins.length > 1) go(i + 1); else if (f >= 1) elapsed = 0, phase = -1;
  }
  const run = () => { if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()));
  // hover or keyboard focus holds the coin on screen
  stage.addEventListener('pointerenter', () => { paused |= 1; stage.classList.add('held'); });
  stage.addEventListener('pointerleave', () => { paused &= ~1; if (!paused) stage.classList.remove('held'); });
  stage.addEventListener('focusin', () => { paused |= 2; stage.classList.add('held'); });
  stage.addEventListener('focusout', () => { paused &= ~2; if (!paused) stage.classList.remove('held'); });
  q('.prev').addEventListener('click', () => go(i - 1));
  q('.next').addEventListener('click', () => go(i + 1));
  if (RM) stage.classList.add('rm');

  // ---------- data: live → snapshot → example ----------
  go(0); run();
  const use = (list, m) => { if (!list.length) return false; const cur = coins[i] && coins[i].mint; coins = list; mode = m; const k = Math.max(0, list.findIndex((c) => c.mint === cur)); if (!cur) go(k); else i = k; return true; };
  // which coins rotate: config.heroCoins until the floor snapshot names the day's busiest pools
  let mints = CFG.heroCoins || [], gen = 0;
  async function refresh() {
    const g = ++gen;
    try { const list = await loadHeroCoins({ ...CFG, heroCoins: mints }); if (g === gen && use(list, 'live')) return; } catch (e) { console.warn('[counterx] live hero failed', e.message); }
    if (g !== gen || mode === 'live') return;   // keep the last live set rather than dropping to the snapshot
    try { if (use(await loadSnapshot(CFG.basePath || ''), 'snapshot')) return; } catch { }
  }
  refresh(); setInterval(() => { if (!document.hidden) refresh(); }, 120000);

  function usePools(pools) {
    const top = pools.filter((p) => p.vol1h > 0 && p.mcUsd > 20000).sort((a, b) => b.vol1h - a.vol1h).slice(0, 11).map((p) => p.mint);
    if (top.length >= 4) { mints = top; refresh(); }
  }
  return { setCoins: (l) => use(l, 'live'), usePools, destroy: stop };
}
