// CounterX · one coin: the cost of size (live reserves), its big floor trades (snapshot + live), the window.
import { CFG, $, $$, esc, shell, pct, sol, short, int, usd, pc2, hhmm, ago, shortAddr, walletLink, txLink, toast, reduced } from './core.js';
import { api, start } from './data.js';
import { counterQuote, sellImpact } from './quote.js';
import { loadHeroCoins, loadHist } from './live.js';
import { startLiveFloor, } from './floorlive.js';
import { DAY } from './floor.js';

shell(); start();
const set = (s, t) => { const el = $(s); if (el) el.textContent = t; };
const mint = decodeURIComponent((location.hash || '').slice(1)).trim();
const SIZES = [0.5, 1, 2, 5, 10];
let coin = null, rows = [], stopLive = null;

if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
  set('.k-sym', 'No coin'); set('.k-note', 'Paste a contract address in the search box to open its page.');
  $('#cost tbody').innerHTML = `<tr><td colspan="7"><div class="empty">No contract address in the link. <a class="btn btn-ln btn-xs" href="coins.html">Every coin</a></div></td></tr>`;
} else boot();
window.addEventListener('hashchange', () => location.reload());

function boot() {
  $('.k-offer').href = 'new.html?mint=' + encodeURIComponent(mint); $('.k-bid').href = 'new.html?side=bid&mint=' + encodeURIComponent(mint);
  set('.k-mint', shortAddr(mint, 6));
  $('.k-dex').href = 'https://dexscreener.com/solana/' + mint; $('.k-scan').href = 'https://solscan.io/token/' + mint; $('.k-pump').href = 'https://pump.fun/coin/' + mint;
  $('.mint').addEventListener('click', async () => { try { await navigator.clipboard.writeText(mint); toast('Contract copied.'); } catch { toast(mint); } });
  $('#cost tbody').innerHTML = SIZES.map(() => `<tr>${'<td><span class="skel"></span></td>'.repeat(7)}</tr>`).join('');
  $('#ctape tbody').innerHTML = Array.from({ length: 4 }, () => `<tr>${'<td><span class="skel"></span></td>'.repeat(9)}</tr>`).join('');
  quote(); setInterval(() => { if (!document.hidden) quote(); }, 20000);
  api('floor').then((j) => {
    rows = ((j && j.rows) || []).filter((r) => r.mint === mint && r.t >= Date.now() - DAY);
    tape();
    const p = j && (j.pools || []).find((x) => x.mint === mint);
    if (p) live(p);
  }).catch(() => tape());
}

// ---------- live reserves → the cost of size ----------
async function quote() {
  let list = [];
  try { list = await loadHeroCoins({ ...CFG, heroCoins: [mint], bagPct: 5 }); } catch { }
  const c = list[0];
  if (!c) {
    if (!coin) { set('.k-note', 'This coin has no pump.fun curve or PumpSwap SOL pool we can read. CounterX quotes pump.fun coins.'); $('#cost tbody').innerHTML = `<tr><td colspan="7"><div class="empty">No readable pump.fun pool for this contract.</div></td></tr>`; set('.k-sym', '$?'); }
    return;
  }
  const first = !coin; coin = c;
  document.title = `CounterX · $${c.sym} · the cost of size`;
  set('.k-sym', '$' + c.sym); set('.k-name', c.name || '');
  const img = $('.k-img'); if (c.img) { img.src = c.img; img.hidden = false; $('.k-ph').hidden = true; } else set('.k-ph', (c.sym || '?').slice(0, 2));
  set('.k-mc', usd(c.mcUsd)); set('.k-px', c.px != null ? c.px.toPrecision(3) + ' SOL' : '—'); set('.k-vol', c.vol1h != null ? sol(c.vol1h, 1) + ' SOL' : '—');
  $('.k-ch').innerHTML = c.ch1h != null ? `<span class="${c.ch1h < 0 ? 'dn' : 'up'}">${pct(c.ch1h, 1, true)}</span>` : '—';
  set('.k-mkt', c.market === 'pool' ? 'PumpSwap' : 'Curve'); set('.k-src', c.src === 'rpc' ? 'read from chain' : 'via DexScreener');
  const fee = CFG.counterFeeBps || 100;
  $('#cost tbody').innerHTML = SIZES.map((s) => {
    const tokens = c.supply * s / 100, q = sellImpact({ ...c.rsv, fee: c.fr }, tokens), ctr = q && counterQuote(q.valueSol, fee);
    if (!q) return '';
    return `<tr class="${s === 5 ? 'hl' : ''}"><td class="num">${pc2(s)}</td><td class="r num h2">${short(tokens)}</td><td class="r num">${sol(q.valueSol)}</td>
      <td class="r num dn">${pct(q.move)}</td><td class="r num h1">${sol(q.solOut)}</td>
      <td class="r num au">${sol(ctr.net)}</td><td class="r num up">+${sol(ctr.net - q.solOut)}</td></tr>`;
  }).join('');
  set('.k-note', `Pool fee ${pct(c.fr * 100, 2)} assumed on the floor; 1.00 % on the SOL leg at the counter. Reserves ${c.src === 'rpc' ? 'read from chain in your browser' : 'from DexScreener'} at ${new Date(c.at).toISOString().slice(11, 19)} UTC, refreshed every 20 s.`);
  if (first) histTry(c.pair, 0);
}

// GeckoTerminal throttles bursts: retry the chart a few times before giving up
function histTry(pair, n) { loadHist(pair).then((h) => { if (h) spark(h); else if (n < 4) setTimeout(() => histTry(pair, n + 1), 12000); else spark(null); }); }
function spark(h) {
  const svg = $('.spark svg'); if (!h || !h.px || h.px.length < 5) { set('.k-sp0', 'no history'); return; }
  const xs = h.px, lo = Math.min(...xs), hi = Math.max(...xs), span = hi - lo || hi, W = 300, H = 120;
  const pts = xs.map((v, i) => `${(i * W / (xs.length - 1)).toFixed(1)} ${(H - 8 - ((v - lo) / span) * (H - 16)).toFixed(1)}`);
  $('.sp-line', svg).setAttribute('d', 'M' + pts.join('L')); $('.sp-area', svg).setAttribute('d', 'M' + pts.join('L') + `L${W} ${H}L0 ${H}Z`);
  const ch = (xs[xs.length - 1] / xs[0] - 1) * 100;
  set('.k-sp0', hhmm(h.t0) + ' UTC'); $('.k-sp1').innerHTML = `<span class="${ch < 0 ? 'dn' : 'up'}">${pct(ch, 1, true)}</span> now`;
}

// ---------- this coin's big trades ----------
function tape(fresh = new Set()) {
  const tb = $('#ctape tbody');
  if (!rows.length) { tb.innerHTML = `<tr><td colspan="9"><div class="empty">No trade of 1 % of supply or more on this coin in the last 24 h${coin ? '' : ' that we scanned'}. New ones appear here as they confirm.</div></td></tr>`; return; }
  const now = Date.now();
  tb.innerHTML = rows.slice(0, 30).map((r) => {
    const w = Math.min(100, Math.abs(r.move));
    return `<tr class="${fresh.has(r.sig) ? 'new' : ''}"><td class="muted num" title="${ago(r.t, now)} ago">${hhmm(r.t)}</td><td><span class="side ${r.kind}">${r.kind === 'sell' ? 'SELL' : 'BUY'}</span></td>
      <td class="r num">${pc2(r.pct)}</td><td class="r num h2">${short(r.tokens)}</td><td class="r num">${sol(r.sol)}</td>
      <td><span class="imp ${r.kind}"><b class="num">${pct(r.move, 1, r.kind === 'buy')}</b><span class="bar"><i style="transform:scaleX(${w / 100})"></i></span></span></td>
      <td class="r num h1 ${r.kind === 'sell' ? 'dn' : 'au'}">${sol(r.lost)}</td><td class="h2">${walletLink(r.wallet)}</td><td class="c h3">${txLink(r.sig)}</td></tr>`;
  }).join('');
}
function live(p) {
  stopLive = startLiveFloor({ pools: [p], seen: rows.map((r) => r.sig), rpc: CFG.heroRpc, everyMs: 15000, onRows: (rs) => { const have = new Set(rows.map((r) => r.sig)); const add = rs.filter((r) => !have.has(r.sig)); if (!add.length) return; rows = add.concat(rows).sort((a, b) => b.t - a.t); tape(new Set(add.map((r) => r.sig))); } });
}

if ('IntersectionObserver' in window && !reduced()) { const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } })); $$('.sec-h').forEach((h) => io.observe(h)); } else $$('.sec-h').forEach((h) => h.classList.add('in'));
