// CounterX · the floor engine. Shared by the scheduled snapshot (scripts/floor.mjs, Node) and the live layer (js/floorlive.js, browser).
// Sources (keyless):
//   GeckoTerminal ...... hot pump.fun pools (PumpSwap + bonding curve) and their recent trades
//   Solana RPC ......... getTransaction for each big trade: pool balances before and after → the exact price impact, no fee assumptions
// Rows are only ever built from a confirmed transaction. A trade we could not read is skipped, never estimated.
import { median, p90 } from './quote.js';

export const WSOL = 'So11111111111111111111111111111111111111112';
export const MIN_PCT = 1;               // a "big" trade: ≥ 1 % of supply
export const DAY = 24 * 3600e3;
// pump.fun mints a fixed 1B supply (a little less after burns). A pool whose implied supply is far outside that has a fake market cap
// or a dead price, and every quote derived from it would be nonsense, so it is left out.
export const saneSupply = (s) => s >= 5e7 && s <= 1.1e9;
// pump.fun bonding curve: virtual reserves = real balances + fixed offsets (verified on mainnet 2026-11-12)
const CURVE_TOK_OFFSET = 73_000_000;    // token account balance + 73M = virtual token reserves (279.9M virtual − 206.9M held back for migration)
const CURVE_SOL_OFFSET = 30;            // + 30 SOL virtual
const CURVE_RENT = 0.00149352;          // rent-exempt lamports of the 166-byte curve account, in SOL
const GT = 'https://api.geckoterminal.com/api/v2/networks/solana';

// ---------- network helpers (fetch is global in browsers and Node ≥ 18) ----------
async function getJson(u, tries = 3) {
  for (let k = 0; ; k++) {
    const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (r.ok) return r.json();
    if (r.status === 429 && k < tries) { await sleep(4000 * (k + 1)); continue; }
    throw new Error(`${r.status} ${u}`);
  }
}
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
export async function rpc(endpoint, method, params) {
  const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('rpc ' + r.status);
  const j = await r.json(); if (j.error) throw new Error(j.error.message || 'rpc error');
  return j.result;
}

// ---------- pools ----------
// One page of a GeckoTerminal pool list → pool metadata. `market`: 'pool' (PumpSwap) | 'curve' (pump.fun bonding curve).
function poolsFrom(j, market) {
  const toks = new Map((j.included || []).filter((x) => x.type === 'token').map((x) => [x.id, x.attributes]));
  return (j.data || []).map((p) => {
    const a = p.attributes, base = p.relationships.base_token.data.id, quote = p.relationships.quote_token.data.id, t = toks.get(base) || {};
    if (quote !== 'solana_' + WSOL) return null;
    const priceUsd = +a.base_token_price_usd, fdv = +a.fdv_usd;
    const supply = priceUsd > 0 && fdv > 0 ? fdv / priceUsd : null;
    return {
      pool: a.address, mint: base.replace('solana_', ''), market, sym: t.symbol || a.name.split(' / ')[0], name: t.name || null,
      img: t.image_url && !/missing/.test(t.image_url) ? t.image_url : null, supply, mcUsd: +a.market_cap_usd || fdv || null, priceUsd,
      vol24: +a.volume_usd?.h24 || 0, reserveUsd: +a.reserve_in_usd || 0, vol1h: +a.volume_usd?.h1 || 0, tx1h: (a.transactions?.h1?.buys || 0) + (a.transactions?.h1?.sells || 0),
    };
  }).filter((p) => p && saneSupply(p.supply));
}
export async function hotPools({ poolPages = 3, curvePages = 2, wait = 6500 } = {}) {
  const out = [];
  for (const [dex, market, pages] of [['pumpswap', 'pool', poolPages], ['pump-fun', 'curve', curvePages]]) {
    for (let page = 1; page <= pages; page++) {
      // GeckoTerminal throttles bursts: retry patiently, and keep the pages we already have if one still fails
      try { out.push(...poolsFrom(await getJson(`${GT}/dexes/${dex}/pools?sort=h24_volume_usd_desc&include=base_token,quote_token&page=${page}`, 6), market)); }
      catch (e) { if (!out.length && dex === 'pump-fun' && page === pages) throw e; }
      await sleep(wait);
    }
  }
  if (!out.length) throw new Error('no pools from GeckoTerminal');
  const seen = new Set(); return out.filter((p) => p.vol24 >= 1000 && !seen.has(p.pool) && seen.add(p.pool));
}

// ---------- trades ----------
// Recent trades on one pool that could be ≥ 1 % of supply (GeckoTerminal filters on USD size; we confirm on token size).
export async function bigTrades(p) {
  const px = p.priceUsd > 0 ? p.priceUsd : p.mcUsd > 0 ? p.mcUsd / p.supply : 0;
  const minUsd = Math.max(5, (p.supply * MIN_PCT / 100) * px * 0.5);
  const j = await getJson(`${GT}/pools/${p.pool}/trades?trade_volume_in_usd_greater_than=${minUsd.toFixed(0)}`);
  return (j.data || []).map((x) => x.attributes).map((a) => {
    const sell = a.kind === 'sell', tokens = +(sell ? a.from_token_amount : a.to_token_amount);
    return { sig: a.tx_hash, t: Date.parse(a.block_timestamp), kind: a.kind, tokens, sol: +(sell ? a.to_token_amount : a.from_token_amount), wallet: a.tx_from_address, pct: (tokens / p.supply) * 100 };
  }).filter((x) => x.pct >= MIN_PCT && x.tokens > 0 && x.sol > 0);
}

// ---------- the exact impact, from the transaction's own balances ----------
export function reservesFromTx(tx, p) {
  const m = tx.meta, keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
  const side = (list) => {
    const own = (list || []).filter((b) => b.owner === p.pool);
    const tok = own.find((b) => b.mint === p.mint), sol = own.find((b) => b.mint === WSOL);
    const ui = (b) => b && +b.uiTokenAmount.uiAmountString;
    return { tok: ui(tok), sol: ui(sol) };
  };
  const pre = side(m.preTokenBalances), post = side(m.postTokenBalances);
  if (p.market === 'curve') {
    const i = keys.indexOf(p.pool); if (i < 0 || pre.tok == null || post.tok == null) return null;
    const sol = (l) => l / 1e9 - CURVE_RENT + CURVE_SOL_OFFSET;
    return { rt0: pre.tok + CURVE_TOK_OFFSET, rs0: sol(m.preBalances[i]), rt1: post.tok + CURVE_TOK_OFFSET, rs1: sol(m.postBalances[i]) };
  }
  if (pre.tok == null || pre.sol == null || post.tok == null || post.sol == null) return null;
  return { rt0: pre.tok, rs0: pre.sol, rt1: post.tok, rs1: post.sol };
}
export async function readTx(endpoint, sig) {
  return rpc(endpoint, 'getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }]);
}

// A trade + its reserves → one floor row. Sells: what the floor paid vs the price before. Buys: what the buyer overpaid.
export function toRow(trade, p, r) {
  if (!r || !(r.rt0 > 0 && r.rs0 > 0 && r.rt1 > 0 && r.rs1 > 0)) return null;
  const px0 = r.rs0 / r.rt0, px1 = r.rs1 / r.rt1, move = (px1 / px0 - 1) * 100, fair = trade.tokens * px0;
  // the transaction must be this one trade: the pool's own balance change has to match the trade's token and SOL legs (±10 %).
  // Multi-swap transactions (routers, sandwiches, bundles) fail this and are skipped rather than mis-measured.
  const dTok = Math.abs(r.rt1 - r.rt0), dSol = Math.abs(r.rs1 - r.rs0), near = (a, b) => Math.abs(a - b) <= 0.1 * b;
  if (!near(dTok, trade.tokens) || !near(dSol, trade.sol)) return null;
  if (trade.kind === 'sell' && (!(move < 0) || trade.sol > fair)) return null;
  if (trade.kind === 'buy' && (!(move > 0) || trade.sol < fair)) return null;
  return {
    t: trade.t, sig: trade.sig, kind: trade.kind, mint: p.mint, sym: p.sym, img: p.img, market: p.market, pool: p.pool,
    pct: +trade.pct.toFixed(3), tokens: Math.round(trade.tokens), sol: +trade.sol.toFixed(4), out: trade.kind === 'sell' ? +trade.sol.toFixed(4) : undefined,
    move: +move.toFixed(2), px0, fair: +fair.toFixed(4),
    lost: trade.kind === 'sell' ? +(fair - trade.sol).toFixed(4) : +(trade.sol - fair).toFixed(4),   // sells: SOL lost vs the price before; buys: SOL overpaid
    wallet: trade.wallet, seller: trade.kind === 'sell' ? trade.wallet : undefined,
  };
}

// ---------- aggregates ----------
const BAND = (pct) => (pct >= 5 ? '5+' : pct >= 2 ? '2-5' : '1-2');
export function bandsOf(rows, now = Date.now()) {
  const sells = rows.filter((r) => r.kind === 'sell' && now - r.t <= DAY);
  const bands = [];
  for (const market of ['curve', 'pool']) for (const band of ['1-2', '2-5', '5+']) {
    const xs = sells.filter((r) => r.market === market && BAND(r.pct) === band);
    if (!xs.length) continue;
    bands.push({ market, band, median: +median(xs.map((r) => r.move)).toFixed(2), p90: +p90(xs.map((r) => -r.move)).toFixed(2) * -1, n: xs.length,
      solOut: +xs.reduce((a, r) => a + r.sol, 0).toFixed(2), lostSol: +xs.reduce((a, r) => a + Math.max(0, r.lost), 0).toFixed(2) });
  }
  return { bands, hero: bands.find((b) => b.market === 'pool' && b.band === '5+') || null, n: sells.length };
}

// The day's floor sells re-quoted at the counter: same block, the price before the sell, 0.0 % impact, 1.00 % fee.
export function whatIfFills(rows, n = 10, now = Date.now(), feeBps = 100) {
  return rows.filter((r) => r.kind === 'sell' && now - r.t <= DAY && r.lost > 0).sort((a, b) => b.lost - a.lost).slice(0, n).map((r) => ({
    id: r.sig, t: r.t, sig: r.sig, mint: r.mint, sym: r.sym, img: r.img, pct: r.pct, tokens: r.tokens, whatIf: true,
    sol: r.fair, net: +(r.fair * (1 - feeBps / 1e4)).toFixed(4), kept: +(r.fair * (1 - feeBps / 1e4) - r.sol).toFixed(4),
    pool: { move: r.move, out: r.sol }, seller: r.wallet,
  }));
}
// The day's big floor buys: bids that would have filled at the window without moving the price.
export function whatIfBids(rows, n = 6, now = Date.now()) {
  return rows.filter((r) => r.kind === 'buy' && now - r.t <= DAY).sort((a, b) => b.lost - a.lost).slice(0, n).map((r) => ({
    pda: r.sig, kind: 'bid', whatIf: true, t: r.t, mint: r.mint, sym: r.sym, img: r.img, pct: r.pct, sol: r.fair, paid: r.sol, move: r.move, over: r.lost,
  }));
}
