// CounterX · landing: hero (stage + outcome board + floor feed), live strip, No. 01 the floor, No. 02 over the counter, No. 03 the window.
// One in-memory set of big trades drives the floor, the size bands, the what-if ledger and the window bids:
// it starts from the scheduled snapshot (data/floor.json) and the live layer adds confirmed trades as they happen.
import { CFG, $, $$, esc, wallet, shell, pct, sol, short, int, pc2, hhmm, hhmmUtc, ago, pl, coinCell, walletLink, txLink, groups, ptKey, reduced } from './core.js';
import { api, stream, start } from './data.js';
import { mountHero } from './hero.js';
import { bandsOf, whatIfFills, whatIfBids, DAY } from './floor.js';
import { startLiveFloor } from './floorlive.js';
import { tickets } from './tickets.js';

shell();
start();
const hero = mountHero($('#stage'), $('.outc'));

// ---------- state ----------
let all = [];            // big trades, newest first (sells + buys), last 24 h
let snap = null;         // the snapshot (since, pools, holder bags)
let lastStats = null, counted = false, liveState = 'off';
const sells = () => all.filter((r) => r.kind === 'sell');
// the 24 h window ends now, or, when the newest snapshot is older than a day, at its newest trade:
// an old snapshot still shows its own last 24 h, clearly dated, instead of an empty page
let staleAt = null;
const refNow = () => staleAt || Date.now();
const day = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) + ' ' + hhmmUtc(t);
function takeSnapshot(j) {
  const rows = (j && j.rows) || [], newest = rows.length ? Math.max(...rows.map((r) => r.t)) : 0;
  staleAt = newest && Date.now() - newest > DAY ? newest : null;
  return rows.filter((r) => r.t >= refNow() - DAY);
}

// ---------- strip ----------
function setK(k, html) { const el = $(`#strip [data-k="${k}"]`); if (el) el.innerHTML = html; }
function strip(s) {
  if (s) lastStats = s; s = lastStats || {};
  const chip = $('.sol-px');
  if (chip) { if (s.solUsd) { chip.hidden = false; chip.classList.remove('stale'); chip.title = 'SOL / USD'; $('.v', chip).textContent = 'SOL $' + s.solUsd.toFixed(2); } else if (!chip.hidden) { chip.classList.add('stale'); chip.title = 'Price feed paused'; } }
  const c = s.coinsBy || {};
  setK('tracked', c.tracked != null ? int(c.tracked) + `<small>${c.active1h != null ? int(c.active1h) + ' active 1h · ' : ''}busiest pump.fun pools</small>` : '—');
  const b = all.length ? bandsOf(all, refNow()) : null;
  setK('median5', b && b.hero ? pct(b.hero.median) : '—');
  setK('big24', b && b.n ? int(b.n) : '—');
  // program numbers: nothing to show until the CounterX program exists
  setK('offers', '—'); setK('bids', '—'); setK('vol', '—'); setK('burned', '—');
  const note = $('[data-k="floorAt"]');
  if (note) {
    const at = snap && snap.generatedAt;
    note.hidden = !at && liveState !== 'live';
    const when = at && Date.now() - at > 20 * 3600e3 ? day(at) : hhmmUtc(at), fresh = at && Date.now() - at < 30 * 60e3;
    note.innerHTML = (liveState === 'live' ? `<span class="live-dot"></span>Floor live in your browser${at ? ' · snapshot ' + when + (fresh ? ', renewed about every 10 min' : '') : ''}` : at ? (Date.now() - at > 30 * 60e3 ? `Floor data is from ${when}. The live feed is off.` : `Floor data as of ${when} · renewed about every 10 min`) : '') + (staleAt ? ' · the 24 h figures run to ' + day(staleAt) + '. Run <code>npm start</code> to refresh.' : '');
  }
  if (!counted && all.length) { counted = true; countUp(); }
}
// count the strip numbers up once on first load (towards the real value; never an invented number)
function countUp() {
  if (reduced()) return;
  for (const el of $$('#strip .v')) {
    const node = el.firstChild; if (!node || node.nodeType !== 3) continue;
    const txt = node.textContent, m = txt.match(/^([−-]?)([\d,]+(?:\.\d+)?)(.*)$/); if (!m) continue;
    const target = +m[2].replace(/,/g, ''), dec = (m[2].split('.')[1] || '').length; if (!(target > 0)) continue;
    const t0 = performance.now(), D = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); node.textContent = m[1] + (target * e).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3]; if (k < 1) requestAnimationFrame(step); else node.textContent = txt; };
    requestAnimationFrame(step);
  }
}
stream.on('hello', (h) => h && strip(h.stats));
stream.on('stats', strip);

// ---------- No. 01 the floor ----------
const PT = $('#pooltape tbody'), PT_N = 12;
function ptRow(r, fresh) {
  const w = Math.min(100, Math.abs(r.move || 0));
  return `<tr class="${fresh ? 'new' : ''}"><td class="muted num" data-hhmm>${hhmm(r.t)}</td><td>${coinCell(r)}</td>
    <td class="h3"><span class="mkt ${r.market === 'pool' ? 'pool' : ''}">${r.market === 'pool' ? 'PUMPSWAP' : 'CURVE'}</span></td>
    <td class="r num">${pc2(r.pct)}</td><td class="r num h2">${short(r.tokens)}</td><td class="r num">${sol(r.sol)}</td>
    <td><span class="imp"><b class="num">${pct(r.move)}</b><span class="bar"><i style="transform:scaleX(${w / 100})"></i></span></span></td>
    <td class="r num dn h1">${r.lost != null ? sol(r.lost) : '—'}</td>
    <td class="h2">${walletLink(r.wallet || r.seller)}</td><td class="c h3">${txLink(r.sig)}</td></tr>`;
}
function hfeed(newKeys = new Set()) {
  const el = $('#hfeed'); if (!el) return;
  const rows = groups(sells().slice(0, 24)).slice(0, 4), now = Date.now();
  el.innerHTML = Array.from({ length: 4 }, (_, i) => {
    const r = rows[i]; if (!r) return '<div class="hfr empty-row"><span class="ph"></span><b class="muted">—</b><span></span><span></span><span></span><span></span></div>';
    const img = r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="ph">${esc((r.sym || '?').slice(0, 2))}</span>`;
    const fresh = r.keys.some((k) => newKeys.has(k));
    return `<a class="hfr${fresh ? ' new' : ''}" href="coin.html#${esc(r.mint)}" title="${r.n > 1 ? r.n + ' sells in a row' : ''}">${img}<b>$${esc(r.sym || '?')}${r.n > 1 ? ` <span class="muted">×${r.n}</span>` : ''}</b><span class="r ink2 num">${pc2(r.pct)}</span><span class="r num dn">${pct((r.f - 1) * 100)}</span><span class="r dn num">${r.lost != null ? '−' + sol(Math.abs(r.lost)) : '—'}</span><span class="r muted num" data-ago="${r.t}">${ago(r.t, now)}</span></a>`;
  }).join('');
}
function ptRender(newKeys = new Set()) {
  hfeed(newKeys);
  const rows = sells();
  if (!rows.length) { PT.innerHTML = `<tr><td colspan="10"><div class="empty">No sell of 1 % of supply or more in the snapshot yet. The floor is quiet.</div></td></tr>`; return; }
  PT.innerHTML = rows.slice(0, PT_N).map((r) => ptRow(r, newKeys.has(ptKey(r)))).join('');
}
PT.innerHTML = Array.from({ length: 6 }, () => `<tr>${'<td><span class="skel"></span></td>'.repeat(10)}</tr>`).join('');
hfeed();

// size bands (24 h or "since HH:MM UTC" when the snapshot covers less)
const BANDS = [['1-2', '1–2 %'], ['2-5', '2–5 %'], ['5+', '5 %+']];
function bands() {
  const j = bandsOf(all, refNow());
  if (!j.bands.length) { $('#bands').innerHTML = BANDS.map(([, t]) => `<tr><td class="sz">${t}</td><td class="r"><span class="m muted">—</span></td><td class="r"><span class="m muted">—</span></td></tr>`).join(''); return; }
  const get = (m, b) => j.bands.find((x) => x.market === m && x.band === b);
  $('#bands').innerHTML = BANDS.map(([b, t]) => { const c = get('curve', b), p = get('pool', b); const cell = (x) => x ? `<span class="m num">${pct(x.median)}</span><span class="p num">p90 ${pct(x.p90)} · ${int(x.n)}</span>` : '<span class="m muted">—</span>'; return `<tr><td class="sz">${t}</td><td class="r">${cell(c)}</td><td class="r">${cell(p)}</td></tr>`; }).join('');
  const since = snap && snap.since, full = !since || refNow() - since > 23.5 * 3600e3, sinceTxt = since ? hhmmUtc(since) : '';
  $('[data-b="win"]').textContent = staleAt ? '24 h to ' + day(staleAt) + ', by size' : full ? 'Last 24 h, by size' : 'Since ' + sinceTxt + ', by size';
  const h = j.hero;
  $('[data-b="hero"]').textContent = h ? pct(h.median) : '—';
  $('[data-b="heroN"]').textContent = h ? `${pl(h.n, 'sell')} ${full ? 'in 24 h' : 'since ' + sinceTxt} · p90 ${pct(h.p90)}` : 'no 5 %+ sell into a PumpSwap pool yet';
  const lost = j.bands.reduce((a, x) => a + (x.lostSol || 0), 0), out = j.bands.reduce((a, x) => a + (x.solOut || 0), 0), n = j.bands.reduce((a, x) => a + (x.n || 0), 0);
  if (lost > 0) { $('[data-b="lost"]').textContent = '−' + sol(lost, lost >= 1000 ? 0 : 1) + ' SOL'; $('[data-b="lostS"]').textContent = `${pl(n, 'sell')} of 1 %+ took ${sol(out, 0)} SOL out; at the price before each sell it was ${sol(out + lost, 0)}`; }
  $('[data-k="big24l"]').textContent = full ? 'Floor sells ≥ 1 % · 24 h' : 'Floor sells ≥ 1 % · since ' + hhmm(since);
}

// ---------- No. 02 over the counter: the day's biggest floor sells, re-quoted at the counter (what if) ----------
const DT = $('#dealtape tbody');
function dtRow(r, fresh) {
  return `<tr class="${fresh ? 'new' : ''}"><td class="muted num">${hhmm(r.t)}</td><td>${coinCell(r)} <span class="wif" title="A real floor sell, re-quoted at the counter: same block, the price before the sell, 1.00 % fee. Not a CounterX trade.">WHAT IF</span></td><td class="r num">${pc2(r.pct)}</td>
    <td class="r num">${sol(r.net)}</td><td class="r num h2"><span class="zero">0.0&nbsp;%</span></td>
    <td class="r num h1"><span class="pl dn">${pct(r.pool.move)}<small>${sol(r.pool.out)} out</small></span></td>
    <td class="r num"><span class="up">+${sol(r.kept)}</span></td>
    <td class="h2">${walletLink(r.seller)}</td><td class="h2 muted">any wallet</td>
    <td class="num h3 muted">none</td><td class="c h3">${txLink(r.sig)}</td></tr>`;
}
let dtKeys = new Set();
function dtRender() {
  const fills = whatIfFills(all, 10, refNow());
  if (!fills.length) { DT.innerHTML = `<tr><td colspan="11"><div class="empty">Nothing has crossed the counter yet. The first fill is stamped here within seconds of confirming.<a class="btn btn-ln btn-xs" href="#book">See the window</a></div></td></tr>`; return; }
  const keys = new Set(fills.map((f) => f.id));
  DT.innerHTML = fills.map((r) => dtRow(r, dtKeys.size && !dtKeys.has(r.id))).join(''); dtKeys = keys;
}

// ---------- No. 03 the window (what if): holder bags that would move the floor · the day's big floor buys ----------
function mineRow(t) {
  const tag = '<span class="mine-tag" title="You put this in the safe">YOURS</span>';
  return `<tr><td>${coinCell(t)}${tag}</td><td class="r num">${pc2(t.pct)}</td><td class="r num">${sol(t.sol)}</td><td class="r num h2">${t.vsMarket != null ? pct(t.vsMarket, 1, true) : '—'}</td><td class="num h3 muted">${hhmm(t.t)}</td><td class="r"><a class="btn btn-ln btn-xs" href="new.html#tickets">Open</a></td></tr>`;
}
function wRow(r, side) {
  const right = side === 'offer'
    ? `<td class="r num">${pc2(r.pct)}</td><td class="r num">${sol(r.sol)}</td><td class="r num h2"><span class="dn">${pct(r.move)}</span></td><td class="num h3 muted">${hhmm(r.t)}</td>`
    : `<td class="r num">${pc2(r.pct)}</td><td class="r num">${sol(r.sol)}</td><td class="r num h2"><span class="up">${pct(r.move, 1, true)}</span></td><td class="num h3 muted">${hhmm(r.t)}</td>`;
  return `<tr><td>${coinCell(r)}</td>${right}<td class="r"><a class="btn btn-ln btn-xs" href="new.html?side=${side === 'offer' ? 'bid' : 'offer'}&mint=${encodeURIComponent(r.mint)}">${side === 'offer' ? 'Bid' : 'Offer'}</a></td></tr>`;
}
function bkRender() {
  const offers = (snap && snap.whatIf && snap.whatIf.offers) || [], bids = whatIfBids(all, 6, refNow());
  const mine = tickets(wallet.address), myO = mine.filter((t) => t.kind === 'offer'), myB = mine.filter((t) => t.kind === 'bid');
  const n = Math.min(8, Math.max(offers.length + myO.length, bids.length + myB.length, 3));
  const put = (sel, mine, rows, side, none) => { const total = mine.length + rows.length; $(sel + ' tbody').innerHTML = total ? mine.slice(0, 4).map(mineRow).join('') + rows.slice(0, 6).map((r) => wRow(r, side)).join('') + '<tr class="pad"><td colspan="6"></td></tr>'.repeat(Math.max(0, n - total)) : `<tr><td colspan="6"><div class="empty" style="min-height:${n * 44}px">${none}</div></td></tr>`; };
  put('#offers', myO, offers, 'offer', 'No bags on the counter. <a class="btn btn-au btn-xs" href="new.html">Put the first one up</a>');
  put('#bids', myB, bids, 'bid', 'No bids at the window. <a class="btn btn-ln btn-xs" href="new.html?side=bid">Place a bid</a>');
  $('#offN').textContent = offers.length ? offers.length + ' bags' : ''; $('#bidN').textContent = bids.length ? bids.length + ' buys' : '';
}

wallet.on(() => bkRender());

// ---------- render everything from `all` ----------
function renderAll(newKeys) { ptRender(newKeys); bands(); dtRender(); bkRender(); strip(); }
function add(rows) {
  const have = new Set(all.map((r) => r.sig)), fresh = rows.filter((r) => !have.has(r.sig));
  if (!fresh.length) return;
  const cut = refNow() - DAY;
  all = fresh.concat(all).filter((r) => r.t >= cut).sort((a, b) => b.t - a.t).slice(0, 4000);
  queue(fresh);
}
// a busy floor can confirm several rows a second: batch DOM writes, at most one every 2 s
let pend = [], pendT = 0;
function queue(rows) { pend.push(...rows); if (!pendT) pendT = setTimeout(flush, 2000); }
function flush() { pendT = 0; const keys = new Set(pend.map(ptKey)); pend = []; if (!document.hidden) renderAll(keys); }

api('floor').then((j) => {
  snap = j;
  all = takeSnapshot(j);
  renderAll();
  // the hero rotates through the day's busiest coins
  if (j && j.pools && j.pools.length) hero.usePools && hero.usePools(j.pools);
  // live layer: new big trades, confirmed on chain, straight into the same set
  if (j && j.pools && CFG.heroRpc) startLiveFloor({ pools: j.pools, seen: all.map((r) => r.sig), rpc: CFG.heroRpc, lookbackMs: staleAt ? 6 * 3600e3 : 15 * 60e3, onRows: add, onStatus: (s) => { liveState = s; strip(); } });
}).catch(() => renderAll());
// the Action publishes a fresh snapshot every ~10 min: pick it up while the page is open, new rows slide in
setInterval(() => {
  if (document.hidden) return;
  api('floor').then((j) => {
    if (!j || (snap && j.generatedAt <= snap.generatedAt)) return;
    const wasStale = !!staleAt, rows = takeSnapshot(j); snap = { ...j, rows: undefined };
    if (wasStale && !staleAt) { const live = all.filter((r) => r.t > Date.now() - DAY); all = []; add(rows.concat(live)); } else add(rows);
    strip(); bkRender();
  }).catch(() => { });
}, +(new URLSearchParams(location.search).get('poll')) || CFG.floorPollMs || 60000);

// ---------- section headers: slide the brass rule in once each comes into view ----------
if ('IntersectionObserver' in window && !reduced()) {
  const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { rootMargin: '0px 0px -10% 0px' });
  $$('.sec-h').forEach((h) => io.observe(h));
} else $$('.sec-h').forEach((h) => h.classList.add('in'));

setInterval(() => { for (const el of $$('[data-ago]')) el.textContent = ago(+el.dataset.ago); }, 5000);
