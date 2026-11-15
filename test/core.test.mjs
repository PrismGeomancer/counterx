import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groups, pct, sol, int, short, num, DASH } from '../js/core.js';
import { decodeCurve, decodePool, b58 } from '../js/live.js';

test('groups(): back-to-back sells of one coin collapse into one row', () => {
  const rows = [
    { sig: 'a', mint: 'M1', pct: 1, move: -10, lost: 2 },
    { sig: 'b', mint: 'M1', pct: 2, move: -20, lost: 3 },
    { sig: 'c', mint: 'M2', pct: 1.5, move: -5, lost: null },
    { sig: 'd', mint: 'M1', pct: 1, move: -1, lost: 1 },
  ];
  const g = groups(rows);
  assert.equal(g.length, 3);
  assert.equal(g[0].n, 2); assert.equal(g[0].pct, 3); assert.equal(g[0].lost, 5);
  assert.ok(Math.abs(g[0].f - 0.9 * 0.8) < 1e-12, 'moves compound');
  assert.deepEqual(g[0].keys, ['a:M1', 'b:M1']);
  assert.equal(g[1].lost, null); assert.equal(g[2].n, 1);
});

test('formatters never invent a number', () => {
  for (const f of [pct, sol, int, short]) { assert.equal(f(null), DASH); assert.equal(f(undefined), DASH); assert.equal(f(NaN), DASH); }
  assert.equal(pct(-19), '−19.0 %');
  assert.equal(pct(1.25, 1, true), '+1.3 %');
  assert.equal(int(29736), '29,736');
  assert.equal(short(47724912), '47.7M');
  assert.equal(sol(585.62), '585.6');
  assert.equal(num(-0.001, 1), '0.0');
});

// Recorded account bytes (layouts verified against mainnet on 2026-11-12).
test('decodeCurve: pump.fun bonding curve layout', () => {
  const b = new Uint8Array(49); const dv = new DataView(b.buffer);
  dv.setBigUint64(8, 984123667019744n, true); dv.setBigUint64(16, 32709304641n, true); dv.setBigUint64(40, 1000000000000000n, true);
  const c = decodeCurve(b);
  assert.equal(c.reserveToken, 984123667.019744); assert.equal(c.reserveSol, 32.709304641); assert.equal(c.supply, 1e9); assert.equal(c.complete, false);
});

test('decodePool: PumpSwap pool layout + base58', () => {
  const b = new Uint8Array(211); b[43 + 31] = 1; b[139] = 255;
  const d = decodePool(b);
  assert.equal(d.baseMint, '11111111111111111111111111111112');
  assert.equal(b58(new Uint8Array([0, 0, 1])), '112');
  assert.ok(d.baseVault.length >= 32);
});
