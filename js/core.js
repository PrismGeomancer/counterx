// CounterX · shared helpers: config, formatters, small DOM utilities, header/footer wiring, toasts.
// Nothing here touches the DOM at import time, so the pure parts (formatters, groups) are testable in Node.

import { HEADER, FOOTER } from './shell.js';
import { wallet } from './wallet.js';
export { wallet };

export const CFG = globalThis.COUNTERX || {};
export const $ = (s, el) => (el || document).querySelector(s);
export const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const url = (p) => (CFG.basePath || '') + p;
export const isMainnet = () => CFG.cluster === 'mainnet-beta';
export const programLive = () => !!CFG.programId;

// ---------- formatters: null / undefined / NaN always print as an em dash, never as a number ----------
const ok = (x) => x != null && Number.isFinite(+x);
const MINUS = '−';
const nf = (d) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const DASH = '—';
export function num(x, d = 0) { if (!ok(x)) return DASH; const s = nf(d).format(Math.abs(+x)); return (+x < 0 && s !== nf(d).format(0) ? MINUS : '') + s; }
export const int = (x) => num(x, 0);
export function pct(x, d = 1, sign = false) { if (!ok(x)) return DASH; const v = +x; const s = num(v, d); return (sign && v > 0 ? '+' : '') + s + ' %'; }
export function sol(x, d) { if (!ok(x)) return DASH; const a = Math.abs(+x); if (d == null) d = a >= 1000 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3; return num(x, d); }
export function short(x, d = 1) {
  if (!ok(x)) return DASH; const a = Math.abs(+x), s = +x < 0 ? MINUS : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(d) + 'B'; if (a >= 1e6) return s + (a / 1e6).toFixed(d) + 'M'; if (a >= 1e3) return s + (a / 1e3).toFixed(d) + 'K';
  return s + a.toFixed(a >= 10 ? 0 : d);
}
export const usd = (x) => (ok(x) ? '$' + short(x, 1) : DASH);
export const hhmm = (t) => (ok(t) ? new Date(+t).toISOString().slice(11, 16) : DASH);
export const hhmmUtc = (t) => (ok(t) ? hhmm(t) + ' UTC' : DASH);
export function ago(t, now = Date.now()) {
  if (!ok(t)) return DASH; const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return s + 's'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd';
}
export const pl = (n, w) => int(n) + ' ' + w + (+n === 1 ? '' : 's');
export const pc2 = (p) => (ok(p) ? num(p, 2) + ' %' : DASH);
export const shortAddr = (a, n = 4) => (a ? a.slice(0, n) + '…' + a.slice(-n) : DASH);

// ---------- table cells ----------
export const coinHref = (mint) => 'coin.html#' + encodeURIComponent(mint || '');
export function coinCell(r) {
  const img = r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="ph">${esc((r.sym || '?').slice(0, 2))}</span>`;
  return r.mint ? `<a class="coin" href="${coinHref(r.mint)}">${img}<b>$${esc(r.sym || '?')}</b></a>` : `<span class="coin">${img}<b>$${esc(r.sym || '?')}</b></span>`;
}
export const walletLink = (a) => (a ? `<a class="addr" href="https://solscan.io/account/${esc(a)}" target="_blank" rel="noopener">${esc(shortAddr(a))}</a>` : DASH);
export const txLink = (sig) => (sig ? `<a class="tx" href="https://solscan.io/tx/${esc(sig)}" target="_blank" rel="noopener" aria-label="Transaction">↗</a>` : '');
export function lockTxt(l) { if (!l) return '<span class="muted">none</span>'; const d = (s) => Math.round(s / 86400) + 'd'; return `${d(l.cliff || 0)} + ${d(l.linear || 0)}`; }

// ---------- the hero feed: back-to-back sells of one coin collapse into ONE row (×N): sizes and SOL lost add up, the moves compound ----------
export const ptKey = (r) => r.sig + ':' + (r.mint || '');
export function groups(rows) {
  const out = [];
  for (const r of rows) {
    const mv = r.move ?? r.impact ?? 0, lost = r.lost ?? r.lostSol, g = out[out.length - 1];
    if (g && g.mint === r.mint) { g.n++; g.pct = (g.pct || 0) + (r.pct || 0); g.f *= 1 + mv / 100; if (lost != null) g.lost = (g.lost || 0) + lost; g.keys.push(ptKey(r)); continue; }
    out.push({ ...r, n: 1, f: 1 + mv / 100, lost: lost ?? null, keys: [ptKey(r)] });
  }
  return out;
}

// ---------- toasts ----------
let toastEl = null, toastT = 0;
export function toast(msg, kind = '') {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.className = 'toast on ' + kind;
  clearTimeout(toastT); toastT = setTimeout(() => { toastEl.className = 'toast'; }, 3600);
}

// ---------- header + footer wiring (the markup is static in the page for first paint) ----------
export function shell() {
  const hdrSlot = $('header[data-shell]'), ftrSlot = $('footer[data-shell]');
  if (hdrSlot) hdrSlot.outerHTML = HEADER; if (ftrSlot) ftrSlot.outerHTML = FOOTER;
  const page = document.body.dataset.page; if (page) for (const a of $$(`[data-nav="${page}"]`)) a.setAttribute('aria-current', 'page');
  // contract address button: hidden until a mint is published
  const ca = $('.ca-btn');
  if (ca && CFG.mint) { ca.hidden = false; $('.ca-v', ca).textContent = shortAddr(CFG.mint); }
  ca && ca.addEventListener('click', async () => {
    if (!CFG.mint) return toast('Contract not published yet.');
    try { await navigator.clipboard.writeText(CFG.mint); toast('Contract copied. Check it against our X.'); } catch { toast(CFG.mint); }
  });
  // socials: hidden when empty
  for (const [k, base] of [['x', 'https://x.com/'], ['telegram', 'https://t.me/']]) {
    for (const a of $$(`[data-social="${k}"]`)) { if (CFG[k]) { a.href = base + CFG[k]; a.hidden = false; } else a.remove(); }
  }
  // devnet tags on every program number
  for (const t of $$('.dev')) t.hidden = isMainnet() || !programLive();
  // footer program id
  const pid = $('[data-k="pid"]'); if (pid) pid.textContent = CFG.programId ? 'program ' + shortAddr(CFG.programId) : 'program —';
  // pages that are not built yet: say so instead of linking to a 404
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-soon]'); if (a) { e.preventDefault(); toast('Coming soon.'); } });
  // search: a CA opens its coin page; a ticker is looked up among the floor's busiest coins
  const f = $('.ca-search');
  f && f.addEventListener('submit', async (e) => {
    e.preventDefault(); const q = (f.q.value || '').trim().replace(/^[$]/, ''); if (!q) return;
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q)) { location.href = coinHref(q); return; }
    try {
      const j = await (await fetch(url('data/floor.json'))).json();
      const hit = (j.pools || []).filter((p) => (p.sym || '').toLowerCase() === q.toLowerCase()).sort((a, b) => b.vol24 - a.vol24)[0];
      if (hit) { location.href = coinHref(hit.mint); return; }
    } catch { }
    toast('No coin with that ticker on the floor today. Paste its contract address.');
  });
  document.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement === document.body && f) { e.preventDefault(); f.q.focus(); } });
  // mobile sheet
  const burger = $('.burger'), sheet = $('.sheet');
  burger && burger.addEventListener('click', () => { const on = document.body.classList.toggle('sheet-on'); burger.setAttribute('aria-expanded', on); });
  sheet && sheet.addEventListener('click', (e) => { if (e.target.closest('a')) document.body.classList.remove('sheet-on'); });
  walletUi();
}

// ---------- wallet: the login. Button, menu, silent reconnect ----------
export async function connectWallet() {
  try { const a = await wallet.connect(); toast('Connected · ' + shortAddr(a)); return a; }
  catch (e) { toast(e && e.code === 'NO_WALLET' ? 'No Solana wallet found. Phantom, Solflare or Backpack work.' : 'Connection cancelled in the wallet.'); return null; }
}
function walletUi() {
  const b = $('.wallet-btn'); if (!b) return;
  const lbl = $('.w-lbl', b), menu = document.createElement('div');
  menu.className = 'wmenu'; menu.hidden = true;
  menu.innerHTML = '<div class="wm-a num"></div><a href="new.html#tickets">My tickets</a><button type="button" data-w="copy">Copy address</button><button type="button" data-w="out">Disconnect</button>';
  b.parentElement.appendChild(menu);
  wallet.on((a) => { lbl.textContent = a ? shortAddr(a) : 'Connect'; b.classList.toggle('on', !!a); $('.wm-a', menu).textContent = a || ''; if (!a) menu.hidden = true; });
  b.addEventListener('click', () => { if (wallet.address) menu.hidden = !menu.hidden; else connectWallet(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.wmenu, .wallet-btn')) menu.hidden = true; });
  menu.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-w]'); if (!t) return; menu.hidden = true;
    if (t.dataset.w === 'out') { await wallet.disconnect(); toast('Disconnected.'); }
    else { try { await navigator.clipboard.writeText(wallet.address); toast('Address copied.'); } catch { toast(wallet.address); } }
  });
  wallet.restore();
}

// ---------- count up once on first load (skipped for reduced motion) ----------
export const reduced = () => globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
