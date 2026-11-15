// CounterX · post an offer / place a bid. Live quote from the pool's reserves; the ticket goes into the safe and shows under My tickets and at the window.
import { CFG, $, $$, esc, shell, pct, sol, short, int, pc2, shortAddr, coinCell, toast, reduced, wallet, connectWallet } from './core.js';
import { api, start } from './data.js';
import { sellImpact, counterQuote } from './quote.js';
import { loadHeroCoins } from './live.js';
import { tickets, addTicket, cancelTicket } from './tickets.js';

shell(); start();
const F = $('.nt-form'), set = (s, t) => { const el = $(s); if (el) el.textContent = t; };
const qs = new URLSearchParams(location.search);
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
let coin = null, loading = '', userPrice = false;

if (qs.get('side') === 'bid') F.side.value = 'bid';
if (qs.get('mint')) F.mint.value = qs.get('mint');
side();

// today's busiest coins as one-click picks
api('floor').then((j) => {
  const picks = ((j && j.pools) || []).filter((p) => p.res && p.res.rs >= 1 && p.res.rt > 0).sort((a, b) => b.vol24 - a.vol24).slice(0, 6);
  $('.nt-picks').innerHTML = picks.map((p) => `<button type="button" data-mint="${esc(p.mint)}">$${esc(p.sym)}</button>`).join('');
}).catch(() => { });
$('.nt-picks').addEventListener('click', (e) => { const b = e.target.closest('button[data-mint]'); if (b) { F.mint.value = b.dataset.mint; userPrice = false; load(); } });

async function load() {
  const m = F.mint.value.trim();
  if (!B58.test(m)) { coin = null; set('.k-coin', m ? 'That is not a Solana address.' : 'Paste an address, or pick one of today\'s busiest:'); return calc(); }
  if (loading === m) return; loading = m; set('.k-coin', 'Reading the pool…');
  let list = []; try { list = await loadHeroCoins({ ...CFG, heroCoins: [m], bagPct: 5 }); } catch { }
  if (F.mint.value.trim() !== m) return;
  coin = list[0] || null; loading = '';
  $('.k-coin').innerHTML = coin ? `${coinCell(coin)} <span class="muted">${coin.market === 'pool' ? 'PumpSwap' : 'Curve'}, ${coin.px.toPrecision(3)} SOL a token</span>` : 'No pump.fun pool found for that address.';
  calc();
}
F.mint.addEventListener('input', () => { userPrice = false; clearTimeout(F._t); F._t = setTimeout(load, 350); });
F.price.addEventListener('input', () => { userPrice = true; calc(); });
for (const el of [F.pct, F.minFill, F.expiry, F.lock, F.buyer]) el.addEventListener('input', calc);
for (const r of $$('input[name=side]', F)) r.addEventListener('change', () => { side(); calc(); });
$$('.nt-quick button').forEach((b) => b.addEventListener('click', () => { if (!coin) return; const v = fairValue(); F.price.value = (v * (1 + +b.dataset.vs / 100)).toPrecision(6); userPrice = true; calc(); }));

function side() {
  const bid = F.side.value === 'bid';
  $('.k-title').innerHTML = bid ? 'Place a <em>bid</em>' : 'Post an <em>offer</em>';
  document.title = 'CounterX · ' + (bid ? 'Place a bid' : 'Post an offer');
  set('.k-role', bid ? 'Buyer' : 'Seller');
  $('.k-lockf').hidden = bid;
}
const tokens = () => coin ? coin.supply * (+F.pct.value || 0) / 100 : 0;
const fairValue = () => tokens() * (coin ? coin.px : 0);

function calc() {
  const bid = F.side.value === 'bid', tk = tokens();
  if (!coin || !(tk > 0)) { set('.k-tokens', '—'); return go(false, coin ? 'Set a size.' : 'Paste a coin to get a quote.'); }
  const fair = fairValue();
  if (!userPrice) F.price.value = fair.toPrecision(6);
  const price = +F.price.value || 0, vs = fair > 0 ? (price / fair - 1) * 100 : null, fee = counterQuote(price, CFG.counterFeeBps || 100);
  set('.k-tokens', `${short(tk)} ${coin.sym}`);
  $('.k-vs').innerHTML = vs == null ? '—' : `<span class="${Math.abs(vs) < 0.05 ? 'au' : vs < 0 ? 'dn' : 'up'}">${pct(vs, 1, true)}</span> vs market`;
  // receipt
  set('.k-rsym', `${bid ? 'bid' : 'offer'} · ${pc2(+F.pct.value)} of $${coin.sym}`);
  set('.k-give', bid ? sol(price) + ' SOL' : short(tk) + ' ' + coin.sym);
  set('.k-get', bid ? short(tk) + ' ' + coin.sym : sol(fee.net) + ' SOL');
  set('.k-fee', sol(fee.feeSol) + ' SOL, paid by the seller');
  set('.k-terms', `${F.minFill.selectedOptions[0].text.toLowerCase()} · ${F.expiry.selectedOptions[0].text}`);
  // the same block on the floor (a sell for an offer, a buy for a bid)
  if (bid) {
    // buying tk tokens from the pool: SOL needed = Rs·tk/(Rt−tk), plus the fee
    const { reserveToken: Rt, reserveSol: Rs } = coin.rsv;
    if (tk >= Rt) { set('.k-fmove', 'not enough'); set('.k-fout', 'the pool holds less than that'); set('.k-kept', '—'); }
    else {
      const cost = (Rs * tk) / (Rt - tk) / (1 - coin.fr), pxAfter = (Rs + cost * (1 - coin.fr)) / (Rt - tk), move = (pxAfter / coin.px - 1) * 100;
      set('.k-fmove', pct(move, 1, true)); set('.k-fout', sol(cost) + ' SOL in'); set('.k-cout', sol(price) + ' SOL in');
      set('.k-kept', (cost - price >= 0 ? '+' : '−') + sol(Math.abs(cost - price)) + ' SOL');
    }
  } else {
    const q = sellImpact({ ...coin.rsv, fee: coin.fr }, tk);
    set('.k-fmove', pct(q.move)); set('.k-fout', sol(q.solOut) + ' SOL out'); set('.k-cout', sol(fee.net) + ' SOL net');
    set('.k-kept', (fee.net - q.solOut >= 0 ? '+' : '−') + sol(Math.abs(fee.net - q.solOut)) + ' SOL');
  }
  set('.k-src', `On the floor: one market ${bid ? 'buy' : 'sell'} against the live pool, pool fee ${pct(coin.fr * 100, 2)}. At the counter: your price, 1.00 % on the SOL leg, and no pool swap, so the price cannot move.`);
  const buyerOk = !F.buyer.value.trim() || B58.test(F.buyer.value.trim());
  go(price > 0 && buyerOk, !buyerOk ? 'That is not a Solana wallet address.' : 'Fee 1.00 % of the SOL leg, paid by the token seller.');
}

// the one button: connect first, then put it in the safe
let busy = false, ready = false;
function go(ok, why) {
  ready = ok; const btn = $('.k-submit'), bid = F.side.value === 'bid';
  if (!wallet.address) { btn.disabled = busy; btn.textContent = 'Connect wallet to post'; set('.k-why', 'Your wallet is your login. Your tickets are here whenever you connect it.'); return; }
  btn.disabled = !ok || busy;
  btn.textContent = busy ? 'Waiting for your wallet…' : bid ? 'Put the SOL in the safe' : 'Put it in the safe';
  set('.k-why', why);
}

F.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!wallet.address) { await connectWallet(); return; }
  if (!coin || !ready || busy) return;
  const bid = F.side.value === 'bid', price = +F.price.value, tk = tokens(), fair = fairValue();
  const q = bid ? null : sellImpact({ ...coin.rsv, fee: coin.fr }, tk);
  const expires = Date.now() + +F.expiry.value * 1000, nonce = 'T' + Date.now().toString(36).toUpperCase();
  // the wallet signs the terms in plain words (a free message signature, not a transaction)
  const terms = ['CounterX ticket ' + nonce, `Side: ${bid ? 'bid' : 'offer'}`, `Coin: $${coin.sym} ${coin.mint}`, `Size: ${pc2(+F.pct.value)} of supply (${int(tk)} tokens)`, `Price: ${sol(price)} SOL for the whole block`,
    `Smallest fill: ${F.minFill.selectedOptions[0].text}`, `Stays in the safe until: ${new Date(expires).toISOString()}`, `Who can fill it: ${F.buyer.value.trim() || 'anyone'}`, 'Fee: 1.00 % of the SOL leg, paid by the token seller', `Wallet: ${wallet.address}`].join('\n');
  busy = true; go(true, '');
  let signature = null;
  try { signature = await wallet.sign(terms); }
  catch { busy = false; go(true, 'Not signed. Nothing went in the safe.'); toast('Not signed. Nothing went in the safe.'); return; }
  busy = false;
  const id = addTicket(wallet.address, { signature, terms, kind: bid ? 'bid' : 'offer', mint: coin.mint, sym: coin.sym, img: coin.img, pct: +F.pct.value, tokens: Math.round(tk), sol: price, vsMarket: fair > 0 ? (price / fair - 1) * 100 : null, move: q ? q.move : null,
    minFill: +F.minFill.value, expires, buyer: F.buyer.value.trim() || null, lock: bid || !F.lock.value ? null : F.lock.value });
  set('.k-no', 'No. ' + id);
  const r = $('.nt-rcpt'); r.classList.remove('stamped'); void r.offsetWidth; r.classList.add('stamped');
  toast('In the safe. Ticket ' + id + ' is under My tickets.');
  set('.k-done-t', `${bid ? 'Bid' : 'Offer'} ${id}: ${pc2(+F.pct.value)} of $${coin.sym} for ${sol(price)} SOL. It stays in the safe until ${new Date(expires).toISOString().slice(0, 16).replace('T', ' ')} UTC, or until you take it back.`);
  $('.nt-go').hidden = true; $('.nt-done').hidden = false;
  mine();
});

// editing the form again, or "Post another", brings the button back
const reopen = () => { $('.nt-done').hidden = true; $('.nt-go').hidden = false; $('.nt-rcpt').classList.remove('stamped'); };
F.addEventListener('input', reopen); $('.k-again').addEventListener('click', reopen);

// my tickets
function mine() {
  const tb = $('#mine tbody');
  if (!wallet.address) { tb.innerHTML = `<tr><td colspan="7"><div class="empty">Connect your wallet to see what you have in the safe.<button class="btn btn-au btn-xs" type="button" data-connect>Connect wallet</button></div></td></tr>`; return; }
  const xs = tickets(wallet.address);
  if (!xs.length) { tb.innerHTML = `<tr><td colspan="7"><div class="empty">Nothing in the safe yet. Put the first block in above.</div></td></tr>`; return; }
  tb.innerHTML = xs.map((t) => `<tr><td><span class="side ${t.kind === 'bid' ? 'buy' : 'sell'}">${t.kind === 'bid' ? 'BID' : 'OFFER'}</span></td><td>${coinCell(t)}</td><td class="r num">${pc2(t.pct)}</td><td class="r num">${sol(t.sol)}</td>
    <td class="r num h2">${t.vsMarket != null ? pct(t.vsMarket, 1, true) : '—'}</td><td class="h2 num muted">${new Date(t.expires).toISOString().slice(5, 16).replace('T', ' ')} UTC</td>
    <td class="r"><button class="btn btn-ln btn-xs" type="button" data-cancel="${esc(t.id)}">Take back</button></td></tr>`).join('');
}
$('#mine').addEventListener('click', (e) => {
  if (e.target.closest('[data-connect]')) return connectWallet();
  const b = e.target.closest('[data-cancel]'); if (b) { cancelTicket(wallet.address, b.dataset.cancel); toast('Taken back out of the safe.'); mine(); }
});
// connecting (or reconnecting on a later visit) shows that wallet's tickets; disconnecting hides them
wallet.on((a) => {
  $('.nt-as').hidden = !a; if (a) set('.k-as', shortAddr(a));
  if (!a) { $('.nt-done').hidden = true; $('.nt-go').hidden = false; }
  calc(); mine();
});
if (F.mint.value) load();
go(false, 'Paste a coin to get a quote.');
if (location.hash === '#tickets') setTimeout(() => $('#tickets').scrollIntoView(), 100);
