// CounterX · the floor snapshot. Runs in the GitHub Action (every ~10 min) or locally: `node scripts/floor.mjs`.
// Writes data/floor.json (24 h of big trades + hot pools + what-if rows), data/bands.json, data/coins.json.
//
// Env:
//   RPC_URL          default https://solana-rpc.publicnode.com (keyless)
//   HELIUS_API_KEY   optional; if set, getTransaction goes to Helius (repository secret, never shipped to the browser)
//   PREV_URL         base URL of the deployed site, to merge the previous snapshot (rolling 24 h); falls back to ./data/floor.json
//   MAX_TX           budget of getTransaction calls per run (default 350)
//   POOL_PAGES / CURVE_PAGES   GeckoTerminal pages of 20 pools each (default 3 / 2 for a full scan, 1 / 1 for a quick refresh)
//   FULL=1           force a full scan. Otherwise a snapshot younger than an hour is refreshed quickly (busiest pools only, ~3 min)
//                    and a full scan runs about once an hour: GeckoTerminal allows ~9 calls a minute, so a full scan takes ~10 min.
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hotPools, bigTrades, readTx, reservesFromTx, toRow, bandsOf, whatIfFills, whatIfBids, rpc, sleep, saneSupply, DAY } from '../js/floor.js';
import { sellImpact } from '../js/quote.js';

const root = fileURLToPath(new URL('..', import.meta.url));
// local runs: read secrets from ./.env (git-ignored). In the Action they come from repository secrets.
try { for (const l of (await readFile(root + '.env', 'utf8')).split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch { }
const RPC = process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : process.env.RPC_URL || 'https://solana-rpc.publicnode.com';
const MAX_TX = +(process.env.MAX_TX || (process.env.HELIUS_API_KEY ? 1200 : 350));   // Helius free tier: 10 req/s
const now = Date.now();
const log = (...a) => console.log('[floor]', ...a);
let rpcCalls = 0, gtCalls = 0;

async function previous() {
  if (process.env.PREV_URL) {
    try { const r = await fetch(process.env.PREV_URL.replace(/\/?$/, '/') + 'data/floor.json', { cache: 'no-store' }); if (r.ok) { log('merged previous snapshot from', process.env.PREV_URL); return await r.json(); } } catch { }
  }
  try { return JSON.parse(await readFile(root + 'data/floor.json', 'utf8')); } catch { return null; }
}

async function main() {
  const prev = await previous();
  const HOUR = 3600e3, quick = !process.env.FULL && !!prev && now - (prev.generatedAt || 0) < HOUR && now - (prev.fullAt || 0) < HOUR;
  const poolPages = +(process.env.POOL_PAGES || (quick ? 1 : 3)), curvePages = +(process.env.CURVE_PAGES || (quick ? 1 : 2));
  const prevRows = (prev?.rows || []).filter((r) => now - r.t <= DAY);
  const seen = new Set(prevRows.map((r) => r.sig));
  // trades we already read and rejected (wash round-trips, bundles, failed transactions) are remembered by a 12-character signature prefix,
  // so they are not read again every run; this is what keeps a refresh to a few minutes
  const skip = new Map((prev?.skip || []).filter(([, t]) => now - t <= DAY)), skipNew = [];
  const prevRes = new Map((prev?.pools || []).filter((p) => p.res).map((p) => [p.pool, p.res]));

  const pools = await hotPools({ poolPages, curvePages });
  gtCalls += poolPages + curvePages;
  log(quick ? 'quick refresh:' : 'full scan:', pools.length, 'hot pools');

  // 1. candidate trades per pool (GeckoTerminal: up to 300 recent trades per pool, filtered by size)
  const cands = [], oldest = [];
  for (const p of pools) {
    try {
      const ts = await bigTrades(p); gtCalls++;
      if (ts.length >= 290) oldest.push(Math.min(...ts.map((x) => x.t)));   // list was full: coverage for this pool starts here
      for (const t of ts) if (now - t.t <= DAY && !seen.has(t.sig) && !skip.has(t.sig.slice(0, 12))) cands.push({ t, p });
    } catch (e) { log('trades failed', p.sym, e.message); }
    if (gtCalls % 10 === 0) log('pools scanned', gtCalls, '· candidates', cands.length);
    await sleep(6500);   // GeckoTerminal throttles bursts: ~9 calls a minute keeps it clean
  }
  cands.sort((a, b) => b.t.t - a.t.t);
  log(cands.length, 'new candidate trades; reading up to', MAX_TX);

  // 2. exact impact from each transaction (newest first, within budget, 4 at a time)
  const rows = [], lastRes = new Map();
  const queue = cands.slice(0, MAX_TX);
  async function worker() {
    while (queue.length) {
      const { t, p } = queue.shift();
      try {
        rpcCalls++; const tx = await readTx(RPC, t.sig); if (!tx) continue;   // not found yet: try again next run
        if (tx.meta?.err) { skipNew.push([t.sig.slice(0, 12), t.t]); continue; }
        const r = reservesFromTx(tx, p), row = toRow(t, p, r);
        if (!row) skipNew.push([t.sig.slice(0, 12), t.t]);
        if (row) { rows.push(row); const cur = lastRes.get(p.pool); if (!cur || cur.t < t.t) lastRes.set(p.pool, { rt: r.rt1, rs: r.rs1, t: t.t }); }
      } catch (e) { if (/429|rate/i.test(e.message)) await sleep(1500); }
    }
  }
  await Promise.all(Array.from({ length: process.env.HELIUS_API_KEY ? 6 : 4 }, worker));
  log(rows.length, 'rows confirmed from', rpcCalls, 'transactions');

  // 3. rolling 24 h
  const all = prevRows.concat(rows).filter((r) => now - r.t <= DAY).sort((a, b) => b.t - a.t);
  const skipped = Math.max(0, cands.length - MAX_TX);
  // coverage: the earliest moment from which every hot pool is fully covered. Never claim 24 h we did not see.
  // trades are read newest first, so the unread ones are the oldest: coverage is (newest unread trade, now].
  let since = prev?.since && now - (prev.generatedAt || 0) < 3600e3 ? Math.max(now - DAY, prev.since) : Math.max(now - DAY, ...oldest);
  if (skipped) since = Math.max(since, Math.max(...cands.slice(MAX_TX).map((c) => c.t.t)) + 1000);

  // 4. pool meta + last known reserves (for holder bags)
  const poolOut = pools.map((p) => ({ ...p, res: lastRes.get(p.pool) || prevRes.get(p.pool) || null }));
  // a quick refresh scans fewer pools: the others keep their last known entry until the next full scan
  if (quick) { const scanned = new Set(pools.map((p) => p.pool)); for (const p of prev.pools || []) if (!scanned.has(p.pool) && saneSupply(p.supply)) poolOut.push(p); }

  // 5. window offers (what-if). With a Helius key: the largest non-pool holder bag of each busy coin. Keyless (public RPCs refuse
  //    getTokenLargestAccounts): a 5 % bag. Either way: what selling it would do on the floor at the pool's last confirmed reserves.
  const offers = [], holders = !!process.env.HELIUS_API_KEY;
  for (const p of poolOut.filter((x) => x.res).sort((a, b) => b.vol24 - a.vol24).slice(0, 10)) {
    if (!holders) {
      const tokens = p.supply * 0.05, q = sellImpact({ reserveToken: p.res.rt, reserveSol: p.res.rs, fee: 0 }, tokens); if (!q) continue;
      offers.push({ pda: 'q5:' + p.mint, kind: 'offer', whatIf: true, t: p.res.t, mint: p.mint, sym: p.sym, img: p.img, pct: 5, tokens: Math.round(tokens), sol: +q.valueSol.toFixed(4), move: +q.move.toFixed(2), out: +q.solOut.toFixed(4), holder: null });
      continue;
    }
    await sleep(500);
    try {
      rpcCalls++; const top = (await rpc(RPC, 'getTokenLargestAccounts', [p.mint])).value.slice(0, 6);
      rpcCalls++; const accs = await rpc(RPC, 'getMultipleAccounts', [top.map((x) => x.address), { encoding: 'jsonParsed' }]);
      const k = accs.value.findIndex((a) => a && a.data?.parsed?.info?.owner && a.data.parsed.info.owner !== p.pool && !/^(TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM|39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg|1nc1nerator11111111111111111111111111111111)$/.test(a.data.parsed.info.owner));
      if (k < 0) continue;
      const owner = accs.value[k].data.parsed.info.owner, tokens = +top[k].uiAmountString, pct = (tokens / p.supply) * 100;
      if (pct < 1) continue;
      const q = sellImpact({ reserveToken: p.res.rt, reserveSol: p.res.rs, fee: 0 }, tokens); if (!q) continue;
      offers.push({ pda: owner + ':' + p.mint, kind: 'offer', whatIf: true, t: p.res.t, mint: p.mint, sym: p.sym, img: p.img, pct: +pct.toFixed(2), tokens: Math.round(tokens), sol: +q.valueSol.toFixed(4), move: +q.move.toFixed(2), out: +q.solOut.toFixed(4), holder: owner });
    } catch (e) { log('holders failed', p.sym, e.message); }
  }
  offers.sort((a, b) => b.sol - a.sol);

  const b = bandsOf(all, now);
  const floor = {
    skip: [...skip, ...skipNew].filter(([, t]) => now - t <= DAY),
    generatedAt: now, fullAt: quick ? prev.fullAt : now, since, coverage: { mode: quick ? 'quick' : 'full', pools: pools.length, candidates: cands.length, read: Math.min(cands.length, MAX_TX), skipped, rpcCalls, gtCalls },
    rows: all, pools: poolOut.map(({ pool, mint, market, sym, name, img, supply, mcUsd, priceUsd, vol24, vol1h, tx1h, res }) => ({ pool, mint, market, sym, name, img, supply, mcUsd, priceUsd, vol24, vol1h, tx1h, res })),
    whatIf: { fills: whatIfFills(all, 10, now), bids: whatIfBids(all, 6, now), offers: offers.slice(0, 6) },
  };
  await mkdir(root + 'data', { recursive: true });
  await writeFile(root + 'data/floor.json', JSON.stringify(floor));
  await writeFile(root + 'data/bands.json', JSON.stringify({ generatedAt: now, since, ...b }));
  await writeFile(root + 'data/coins.json', JSON.stringify({ generatedAt: now, tracked: pools.length, active1h: pools.filter((p) => p.tx1h > 0).length }));
  log(`rpc: ${process.env.HELIUS_API_KEY ? 'helius' : 'public'} · wrote ${all.length} rows (${all.filter((r) => r.kind === 'sell').length} sells), since ${new Date(since).toISOString()}, rpc calls ${rpcCalls}, gt calls ${gtCalls}`);
}

main().catch((e) => { console.error('[floor] failed, keeping the last good snapshot:', e.message); process.exit(0); });
