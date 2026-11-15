// CounterX · floor maths. Pure functions, no DOM, no network: shared by the hero, the tests and (Phase 2) the floor Action.
// Constant product x·y = k. A sell of dx tokens into reserves (Rt tokens, Rs SOL):
//   gross   = Rs·dx / (Rt + dx)          SOL the curve hands out before fees
//   solOut  = gross · (1 − fee)          what the seller actually receives
//   pxAfter = (Rs − gross) / (Rt + dx)   spot price after the sell
//   move    = pxAfter / px − 1           price impact, in %
//   cost    = 1 − solOut / (dx · px)     SOL lost against the price before the sell, in %

export function sellImpact({ reserveToken, reserveSol, fee = 0 }, tokensIn) {
  if (!(reserveToken > 0) || !(reserveSol > 0) || !(tokensIn > 0)) return null;
  const px = reserveSol / reserveToken;
  const gross = (reserveSol * tokensIn) / (reserveToken + tokensIn);
  const solOut = gross * (1 - fee);
  const pxAfter = (reserveSol - gross) / (reserveToken + tokensIn);
  const valueSol = tokensIn * px;
  return {
    px, gross, solOut, pxAfter, valueSol,
    avgPx: solOut / tokensIn,
    move: (pxAfter / px - 1) * 100,
    cost: (1 - solOut / valueSol) * 100,
    lostSol: valueSol - solOut,
  };
}

// At the counter there is no pool swap: the block crosses at the agreed price, the seller pays the fee on the SOL leg.
export function counterQuote(valueSol, feeBps = 100) {
  if (!(valueSol >= 0)) return null;
  const feeSol = (valueSol * feeBps) / 10000;
  return { sol: valueSol, feeSol, net: valueSol - feeSol, move: 0 };
}

// Inverse of sellImpact for a recorded quote (spot price, tokens sold, gross SOL): used to check old engine output.
export function reservesFromQuote(px, tokensIn, gross) {
  const reserveToken = (gross * tokensIn) / (px * tokensIn - gross);
  return { reserveToken, reserveSol: px * reserveToken };
}

const sorted = (xs) => xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
export function quantile(xs, q) {
  const s = sorted(xs); if (!s.length) return null;
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
export const median = (xs) => quantile(xs, 0.5);
export const p90 = (xs) => quantile(xs, 0.9);
