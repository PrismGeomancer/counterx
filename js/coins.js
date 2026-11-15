// CounterX · every coin's cost of size: the snapshot's hot pools, re-quoted from live reserves every minute.
import { CFG, $, $$, esc, shell, pct, sol, int, usd, hhmmUtc, coinCell, coinHref } from './core.js';
import { api, start } from './data.js';
import { loadHeroCoins } from './live.js';
import { median, sellImpact } from './quote.js';
import { DAY } from './floor.js';

shell(); start();
const TB = $('#coins tbody');
let list = [], sortKey = 'move', sortDir = 1, market = 'all', filter = '', liveAt = null;
TB.innerHTML = Array.from({ length: 10 }, () => `<tr>${'<td><span class="skel"></span></td>'.repeat(9)}</tr>`).join('');

api('floor').then((j) => {
  if (!j || !j.pools) { TB.innerHTML = `<tr><td colspan="9"><div class="empty">The floor snapshot is not published yet. It appears within ten minutes of the first deploy.</div></td></tr>`; return; }
  const cut = Date.now() - DAY, rows = (j.rows || []).filter((r) => r.kind === 'sell' && r.t >= cut);
  list = j.pools.map((p) => {
    const mine = rows.filter((r) => r.mint === p.mint);
    const q = p.res ? sellImpact({ reserveToken: p.res.rt, reserveSol: p.res.rs, fee: 0 }, p.supply * 0.05) : null;
    return { ...p, n: mine.length, med: mine.length ? median(mine.map((r) => r.move)) : null, move: q ? q.move : null, lost: q ? q.valueSol - q.solOut : null, at: p.res ? p.res.t : null, src: 'snapshot' };
  });
  render(); $('.cs-at').textContent = 'snapshot ' + hhmmUtc(j.generatedAt);
  refresh(); setInterval(() => { if (!document.hidden) refresh(); }, 60000);
}).catch(() => { TB.innerHTML = `<tr><td colspan="9"><div class="empty">The floor snapshot could not be read. Try again in a minute.</div></td></tr>`; });

// live: DexScreener batch + chain reserves (PublicNode, 10 accounts a call) for every listed coin
async function refresh() {
  try {
    const live = await loadHeroCoins({ ...CFG, heroCoins: list.map((p) => p.mint), bagPct: 5, fees: { curve: 0, pool: 0 } });
    const by = new Map(live.map((c) => [c.mint, c]));
    for (const p of list) { const c = by.get(p.mint); if (!c) continue; p.move = c.pool.move; p.lost = c.bag.valueSol - c.pool.out; p.mcUsd = c.mcUsd ?? p.mcUsd; if (c.vol1h != null && c.solUsd) p.vol1h = c.vol1h * c.solUsd; p.src = c.src; if (!p.img) p.img = c.img; }
    liveAt = Date.now(); $('.cs-at').innerHTML = `<span class="live-dot"></span>live · ${hhmmUtc(liveAt)}`; render();
  } catch { }
}

function render() {
  const q = filter.toLowerCase();
  const rows = list.filter((p) => (market === 'all' || p.market === market) && (!q || (p.sym || '').toLowerCase().includes(q)))
    .sort((a, b) => { const x = a[sortKey], y = b[sortKey]; if (x == null) return 1; if (y == null) return -1; return (x - y) * sortDir; });
  if (!rows.length) { TB.innerHTML = `<tr><td colspan="9"><div class="empty">No coin matches.</div></td></tr>`; return; }
  TB.innerHTML = rows.map((p, i) => {
    const w = Math.min(100, Math.abs(p.move || 0));
    return `<tr class="go" data-href="${coinHref(p.mint)}"><td class="muted num">${i + 1}</td><td>${coinCell(p)}</td>
      <td class="h3"><span class="mkt ${p.market === 'pool' ? 'pool' : ''}">${p.market === 'pool' ? 'PUMPSWAP' : 'CURVE'}</span></td>
      <td class="r num">${usd(p.mcUsd)}</td><td class="r num h2">${usd(p.vol1h)}</td>
      <td class="r num h1">${p.n ? int(p.n) : '<span class="muted">0</span>'}</td><td class="r num h2 dn">${p.med != null ? pct(p.med) : '—'}</td>
      <td><span class="imp"><b class="num">${pct(p.move)}</b><span class="bar"><i style="transform:scaleX(${w / 100})"></i></span></span></td>
      <td class="r num h1 dn">${p.lost != null ? sol(p.lost) : '—'}</td></tr>`;
  }).join('');
}

// sort, filter, whole-row click
$$('#coins th[data-sort]').forEach((th) => { th.tabIndex = 0; const go = () => { const k = th.dataset.sort; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = k === 'move' || k === 'med' ? 1 : -1; } $$('#coins th[data-sort]').forEach((x) => x.removeAttribute('aria-sort')); th.setAttribute('aria-sort', sortDir > 0 ? 'ascending' : 'descending'); render(); }; th.addEventListener('click', go); th.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); });
$('.cs-filter input').addEventListener('input', (e) => { filter = e.target.value.trim().replace(/^[$]/, ''); render(); });
$$('.cs-seg button').forEach((b) => b.addEventListener('click', () => { market = b.dataset.m; $$('.cs-seg button').forEach((x) => x.setAttribute('aria-pressed', x === b)); render(); }));
TB.addEventListener('click', (e) => { if (e.target.closest('a')) return; const tr = e.target.closest('tr[data-href]'); if (tr) location.href = tr.dataset.href; });
$$('.sec-h').forEach((h) => h.classList.add('in'));
