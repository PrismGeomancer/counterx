// CounterX · live market reads for the hero, straight from the browser. No keys.
//   1. DexScreener batch: name, symbol, image, market cap, 1 h volume / change, the pair address and its dex.
//   2. Solana RPC getMultipleAccounts on the pair: the pump.fun bonding curve (virtual reserves) or the PumpSwap pool (vault balances).
//   3. If RPC fails: DexScreener's liquidity.base / liquidity.quote (pool reserves as DexScreener last saw them).
// Every coin carries `src` ('rpc' | 'dex' | 'snapshot') and `at` so the UI can say where the number came from.
import { sellImpact } from './quote.js';
import { saneSupply } from './floor.js';

const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMPSWAP = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const WSOL = 'So11111111111111111111111111111111111111112';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58(bytes) {
  let n = 0n; for (const x of bytes) n = n * 256n + BigInt(x);
  let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of bytes) { if (x) break; s = '1' + s; }
  return s;
}
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const u64 = (b, o) => { let v = 0n; for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[o + i]); return v; };

// pump.fun bonding curve: 8-byte discriminator, then virtualTokenReserves, virtualSolReserves, realToken, realSol, tokenTotalSupply (u64 LE), complete (bool @48)
export function decodeCurve(bytes) {
  return { reserveToken: Number(u64(bytes, 8)) / 1e6, reserveSol: Number(u64(bytes, 16)) / 1e9, supply: Number(u64(bytes, 40)) / 1e6, complete: bytes[48] === 1 };
}
// PumpSwap pool: discriminator(8) bump(1) index(2) creator(32) baseMint@43 quoteMint@75 lpMint@107 baseVault@139 quoteVault@171
export function decodePool(bytes) {
  const k = (o) => b58(bytes.subarray(o, o + 32));
  return { baseMint: k(43), quoteMint: k(75), baseVault: k(139), quoteVault: k(171) };
}

async function rpc(endpoint, method, params) {
  const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!r.ok) throw new Error('rpc ' + r.status);
  const j = await r.json(); if (j.error) throw new Error(j.error.message || 'rpc error');
  return j.result;
}
// getMultipleAccounts in chunks of 10 (public RPCs such as PublicNode reject more than 10 accounts per call)
async function multi(endpoint, addrs, encoding) {
  const out = [];
  for (let i = 0; i < addrs.length; i += 10) out.push(...(await rpc(endpoint, 'getMultipleAccounts', [addrs.slice(i, i + 10), { encoding }])).value);
  return out;
}
async function getJson(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }

// Pick the deepest SOL pair per mint from DexScreener (pump.fun curve or PumpSwap only).
async function dexPairs(mints) {
  const out = new Map();
  for (let i = 0; i < mints.length; i += 30) {
    const rows = await getJson('https://api.dexscreener.com/tokens/v1/solana/' + mints.slice(i, i + 30).join(','));
    for (const p of rows || []) {
      if (!['pumpfun', 'pumpswap'].includes(p.dexId) || p.quoteToken?.address !== WSOL) continue;
      const m = p.baseToken.address, cur = out.get(m);
      if (!cur || (p.liquidity?.usd || 0) > (cur.liquidity?.usd || 0)) out.set(m, p);
    }
  }
  return out;
}

// Reserves from chain: one getMultipleAccounts for all pairs, one more for the PumpSwap vaults.
async function chainReserves(endpoint, pairs) {
  const addrs = pairs.map((p) => p.pairAddress);
  const res = await multi(endpoint, addrs, 'base64');
  const out = new Map(), vaults = [];
  res.forEach((acc, i) => {
    if (!acc) return; const p = pairs[i], bytes = fromB64(acc.data[0]);
    if (acc.owner === PUMP) { const c = decodeCurve(bytes); if (!c.complete) out.set(p.pairAddress, { market: 'curve', reserveToken: c.reserveToken, reserveSol: c.reserveSol, supply: c.supply }); }
    else if (acc.owner === PUMPSWAP) {
      // pump.fun migrations put the coin in base and SOL in quote; pools made by hand can be the other way round
      const d = decodePool(bytes);
      if (d.quoteMint === WSOL) vaults.push({ pair: p.pairAddress, base: d.baseVault, quote: d.quoteVault });
      else if (d.baseMint === WSOL) vaults.push({ pair: p.pairAddress, base: d.quoteVault, quote: d.baseVault });
    }
  });
  if (vaults.length) {
    const v = await multi(endpoint, vaults.flatMap((x) => [x.base, x.quote]), 'jsonParsed');
    vaults.forEach((x, i) => {
      const b = v[2 * i], q = v[2 * i + 1];
      const amt = (a) => a && a.data && a.data.parsed && +a.data.parsed.info.tokenAmount.uiAmountString;
      const rt = amt(b), rs = amt(q); if (rt > 0 && rs >= 1) out.set(x.pair, { market: 'pool', reserveToken: rt, reserveSol: rs });
    });
  }
  return out;
}

// Turn one pair + reserves into the hero coin shape (same fields the stage and the board read).
export function toCoin(p, rsv, { bagPct, fees, src, at }) {
  const market = rsv.market || (p.dexId === 'pumpswap' ? 'pool' : 'curve');
  const priceNative = +p.priceNative, priceUsd = +p.priceUsd;
  const solUsd = priceNative > 0 && priceUsd > 0 ? priceUsd / priceNative : null;
  const supply = rsv.supply || (p.fdv && priceUsd ? p.fdv / priceUsd : null);
  if (!saneSupply(supply)) return null;
  const tokens = supply * bagPct / 100, fr = fees[market];
  const q = sellImpact({ reserveToken: rsv.reserveToken, reserveSol: rsv.reserveSol, fee: fr }, tokens);
  if (!q) return null;
  return {
    mint: p.baseToken.address, sym: p.baseToken.symbol, name: p.baseToken.name, img: p.info?.imageUrl || null,
    pair: p.pairAddress, market, px: q.px, mcUsd: p.marketCap ?? p.fdv ?? null, supply, solUsd,
    vol1h: p.volume?.h1 != null && solUsd ? p.volume.h1 / solUsd : null, ch1h: p.priceChange?.h1 ?? null, fr,
    bag: { pct: bagPct, tokens, valueSol: q.valueSol },
    pool: { move: q.move, out: q.solOut, gross: q.gross, cost: q.cost, pxAfter: q.pxAfter },
    rsv: { reserveToken: rsv.reserveToken, reserveSol: rsv.reserveSol }, priceUsd: +p.priceUsd || null, dex: p.dexId, url: p.url,
    hist: null, src, at,
  };
}

export async function loadHeroCoins(cfg) {
  const mints = cfg.heroCoins || [], at = Date.now(), opts = { bagPct: cfg.bagPct || 5, fees: cfg.fees || { curve: 0.0125, pool: 0.003 }, at };
  if (!mints.length) return [];
  const byMint = await dexPairs(mints);
  // DexScreener's token lookup sometimes lists another DEX's pair first and omits the pump.fun one.
  // The floor snapshot already knows each busy coin's PumpSwap pool / bonding curve: use that, and read its reserves on chain.
  if (mints.some((m) => !byMint.has(m))) {
    const known = await knownPools();
    for (const m of mints) {
      const p = !byMint.has(m) && known.get(m); if (!p) continue;
      byMint.set(m, { pairAddress: p.pool, dexId: p.market === 'pool' ? 'pumpswap' : 'pumpfun', baseToken: { address: m, symbol: p.sym, name: p.name || p.sym },
        priceUsd: p.priceUsd, fdv: p.supply && p.priceUsd ? p.supply * p.priceUsd : p.mcUsd, marketCap: p.mcUsd, info: { imageUrl: p.img }, volume: {}, priceChange: {} });
    }
  }
  const pairs = mints.map((m) => byMint.get(m)).filter(Boolean);
  let chain = new Map();
  if (cfg.heroRpc) { try { chain = await chainReserves(cfg.heroRpc, pairs); } catch (e) { console.warn('[counterx] RPC reserves failed, using DexScreener liquidity', e.message); } }
  const coins = [];
  for (const p of pairs) {
    let c = null;
    if (chain.has(p.pairAddress)) c = toCoin(p, chain.get(p.pairAddress), { ...opts, src: 'rpc' });
    else if (p.liquidity?.base > 0 && p.liquidity?.quote > 0) c = toCoin(p, { reserveToken: p.liquidity.base, reserveSol: p.liquidity.quote }, { ...opts, src: 'dex' });
    if (c) coins.push(c);
  }
  return coins.sort((a, b) => a.pool.move - b.pool.move);
}

let knownP = null;
function knownPools() {
  if (!knownP) knownP = fetch((globalThis.COUNTERX?.basePath || '') + 'data/floor.json').then((r) => (r.ok ? r.json() : null))
    .then((j) => new Map(((j && j.pools) || []).map((p) => [p.mint, p]))).catch(() => new Map());
  return knownP;
}

// One hour of 1-minute closes for the chart (GeckoTerminal, keyless, CORS). Native (SOL) prices.
const histCache = new Map();
export async function loadHist(pair) {
  if (!pair) return null; if (histCache.has(pair)) return histCache.get(pair);
  const p = getJson(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pair}/ohlcv/minute?aggregate=1&limit=60&currency=token`)
    .then((j) => {
      const list = (j?.data?.attributes?.ohlcv_list || []).slice().sort((a, b) => a[0] - b[0]);
      if (list.length < 5) return null;
      return { t0: list[0][0] * 1000, step: 60000, px: list.map((r) => +r[4]) };
    }).catch(() => null);
  histCache.set(pair, p); p.then((h) => { if (!h) histCache.delete(pair); }); return p;
}

// Snapshot fallback (dated): the recorded hero coins in data/hero-snapshot.json.
export async function loadSnapshot(base = '') {
  const j = await getJson(base + 'data/hero-snapshot.json');
  return (j.hero.coins || []).map((c) => ({ ...c, src: 'snapshot', at: j.at, mcUsd: c.mcUsd, solUsd: c.mcUsd && c.mc ? c.mcUsd / c.mc : null }));
}
