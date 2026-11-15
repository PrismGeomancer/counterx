import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reservesFromTx, toRow, bandsOf, whatIfFills, whatIfBids, saneSupply, WSOL } from '../js/floor.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const bal = (owner, mint, ui) => ({ owner, mint, uiTokenAmount: { uiAmountString: String(ui) } });

// Recorded on mainnet (2026-11-12): ANSEM PumpSwap sell 2nwpQp5z…, pool FnzKY6x7…; vault balances before / after the trade.
const POOL = { pool: 'FnzKY6x7entQ1eR3D225dQyT7ybfka4PskBMQhb8L3CC', mint: '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump', market: 'pool', sym: 'ANSEM', supply: 997354955 };
const poolTx = { transaction: { message: { accountKeys: [{ pubkey: 'C7abt7Qk6giqzG3G7PuVfvPio2H4u6QiYTJiiutdnX4M' }, { pubkey: POOL.pool }] } },
  meta: { preBalances: [0, 0], postBalances: [0, 0],
    preTokenBalances: [bal(POOL.pool, POOL.mint, '11716133.040559'), bal(POOL.pool, WSOL, '8324.183512276')],
    postTokenBalances: [bal(POOL.pool, POOL.mint, '11753740.376333'), bal(POOL.pool, WSOL, '8297.622652063')] } };

test('reservesFromTx: PumpSwap vault balances before/after', () => {
  const r = reservesFromTx(poolTx, POOL);
  assert.equal(r.rt0, 11716133.040559); assert.equal(r.rs0, 8324.183512276); assert.equal(r.rt1, 11753740.376333);
});

test('toRow: the recorded ANSEM sell', () => {
  const trade = { sig: '2nwpQp5z', t: 1, kind: 'sell', tokens: 37607.335774, sol: 26.554201687, wallet: 'C7ab', pct: (37607.335774 / POOL.supply) * 100 };
  const row = toRow(trade, POOL, reservesFromTx(poolTx, POOL));
  // price before 8324.18/11716133 = 7.1049e-4, after 8297.62/11753740 = 7.0596e-4 → −0.64 %
  close(row.move, ((8297.622652063 / 11753740.376333) / (8324.183512276 / 11716133.040559) - 1) * 100, 0.01, 'move');
  close(row.fair, 37607.335774 * (8324.183512276 / 11716133.040559), 1e-3, 'fair');
  assert.ok(row.lost > 0 && row.lost < 1, 'lost is the gap to the price before');
});

// Recorded curve trade on mainnet (eggroll, curve a4wsdmH1…): the curve's token account and lamports.
test('reservesFromTx: bonding curve virtual reserves from real balances', () => {
  const C = { pool: 'a4wsdmH1A6Rq6FnkeWRaWkrefLkVRA2bMp1FifChmvU', mint: 'AeG2JrKhnqsWgYoJza7yQ67jDr21taqyPiGrvgm2pump', market: 'curve' };
  const tx = { transaction: { message: { accountKeys: ['w', 'x', 'y', 'z', C.pool] } },
    meta: { preBalances: [0, 0, 0, 0, 2710798161], postBalances: [0, 0, 0, 0, 1518381769],
      preTokenBalances: [bal(C.pool, C.mint, '911123667.019744')], postTokenBalances: [bal(C.pool, C.mint, '948659108.682355')] } };
  const r = reservesFromTx(tx, C);
  close(r.rt0, 984123667.019744, 1e-6, 'virtual tokens = balance + 73M');
  close(r.rs0, 2.710798161 - 0.00149352 + 30, 1e-9, 'virtual SOL = lamports − rent + 30');
});

test('bands, what-if fills and bids', () => {
  const now = Date.now(), row = (o) => ({ t: now - 1000, kind: 'sell', market: 'pool', pct: 1.5, move: -10, sol: 10, lost: 1, fair: 11, tokens: 1, sig: Math.random() + '', ...o });
  const rows = [row({ move: -10 }), row({ move: -20 }), row({ move: -30, pct: 6, lost: 5 }), row({ kind: 'buy', move: 12, lost: 2 }), row({ t: now - 2 * 86400e3, move: -90 })];
  const b = bandsOf(rows, now);
  assert.equal(b.n, 3, 'only 24 h sells');
  assert.equal(b.bands.find((x) => x.band === '1-2').median, -15);
  assert.equal(b.hero.median, -30);
  const f = whatIfFills(rows, 10, now);
  assert.equal(f[0].pool.move, -30, 'biggest SOL lost first');
  close(f[0].net, 11 * 0.99, 1e-9, 'net after 1 % fee'); close(f[0].kept, 11 * 0.99 - 10, 1e-9, 'kept vs floor');
  assert.ok(f.every((x) => x.whatIf));
  assert.equal(whatIfBids(rows, 6, now).length, 1);
});

test('saneSupply: pump.fun coins have ~1B supply, fake market caps are rejected', () => {
  assert.ok(saneSupply(1e9) && saneSupply(9.4e8) && saneSupply(1e8));
  assert.ok(!saneSupply(1.2e10) && !saneSupply(5e12) && !saneSupply(null) && !saneSupply(0));
});
