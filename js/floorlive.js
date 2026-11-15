// CounterX · the live floor, in the visitor's browser. Keyless.
// Walks the busiest pump.fun pools one at a time (GeckoTerminal throttles bursts; one call every ~6.5 s per visitor stays clean), picks up new trades
// of ≥ 1 % of supply, confirms each one with getTransaction and emits a row with the exact impact. Nothing is estimated.
import { bigTrades, readTx, reservesFromTx, toRow, sleep } from './floor.js';

export function startLiveFloor({ pools, seen, rpc, onRows, onStatus, everyMs = 7000, maxPools = 24, lookbackMs = 15 * 60e3 }) {
  const list = pools.slice().sort((a, b) => (b.tx1h || 0) - (a.tx1h || 0)).slice(0, maxPools);
  if (!list.length || !rpc) return () => { };
  const known = new Set(seen);
  let k = 0, stopped = false, fails = 0;
  const startedAt = Date.now() - lookbackMs;   // first pass: pick up what happened recently (longer when the snapshot is old)
  async function loop() {
    await sleep(9000);   // let the hero's first chart reads go first: GeckoTerminal throttles bursts
    while (!stopped) {
      if (document.hidden) { await sleep(2000); continue; }
      const p = list[k++ % list.length];
      try {
        const fresh = (await bigTrades(p)).filter((t) => !known.has(t.sig) && t.t >= startedAt);
        fails = 0; onStatus && onStatus('live');
        const rows = [];
        for (const t of fresh.slice(0, lookbackMs > 3600e3 ? 8 : 4)) {
          known.add(t.sig);
          try { const tx = await readTx(rpc, t.sig); if (!tx || tx.meta?.err) continue; const row = toRow(t, p, reservesFromTx(tx, p)); if (row) rows.push(row); } catch { }
        }
        if (rows.length) onRows(rows);
      } catch (e) {
        if (++fails >= 5) { onStatus && onStatus('paused'); await sleep(30000); fails = 0; }
        else if (/429/.test(e.message)) await sleep(8000);
      }
      await sleep(everyMs);
    }
  }
  loop();
  return () => { stopped = true; };
}
