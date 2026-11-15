import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sellImpact, counterQuote, reservesFromQuote, median, p90 } from '../js/quote.js';

const boot = JSON.parse(readFileSync(new URL('../data/hero-snapshot.json', import.meta.url)));
const coin = (sym) => boot.hero.coins.find((c) => c.sym === sym);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// Hand-checked against the recorded engine output: reserves are derived from spot price + gross SOL,
// then move / out / cost are recomputed independently and must match what the old engine printed.
for (const sym of ['ANSEM', 'CATE', 'eggroll']) {
  test(`sellImpact matches recorded quote: ${sym}`, () => {
    const c = coin(sym);
    const r = reservesFromQuote(c.px, c.bag.tokens, c.pool.gross);
    const q = sellImpact({ reserveToken: r.reserveToken, reserveSol: r.reserveSol, fee: c.fr }, c.bag.tokens);
    close(q.gross, c.pool.gross, 1e-6 * c.pool.gross, 'gross');
    close(q.solOut, c.pool.out, 0.01 * Math.max(1, c.pool.out / 100), 'out');
    close(q.move, c.pool.move, 0.01, 'move');
    close(q.cost, c.pool.cost, 0.01, 'cost');
    close(q.valueSol, c.bag.valueSol, 1e-3 * c.bag.valueSol, 'value');
  });
}

test('sellImpact: simple constant product by hand', () => {
  // 1,000 tokens / 10 SOL, sell 100 tokens, no fee: gross = 10*100/1100 = 0.90909..., pxAfter = 9.0909/1100
  const q = sellImpact({ reserveToken: 1000, reserveSol: 10, fee: 0 }, 100);
  close(q.gross, 0.9090909, 1e-6, 'gross');
  close(q.move, ((9.0909091 / 1100) / 0.01 - 1) * 100, 1e-4, 'move');
});

test('sellImpact: zero / bad input returns null', () => {
  assert.equal(sellImpact({ reserveToken: 0, reserveSol: 10, fee: 0 }, 1), null);
  assert.equal(sellImpact({ reserveToken: 10, reserveSol: 10, fee: 0 }, 0), null);
});

test('counterQuote: 1 % fee, move is exactly 0', () => {
  const q = counterQuote(100, 100);
  assert.equal(q.move, 0); close(q.feeSol, 1, 1e-12, 'fee'); close(q.net, 99, 1e-12, 'net');
});

test('median / p90', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  close(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 9.1, 1e-9, 'p90');
});
