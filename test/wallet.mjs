// Wallet flow, with a mock Phantom-style provider: connect gate, sign-then-safe, silent reconnect, per-wallet tickets, disconnect.
//   node test/wallet.mjs     (needs the site on http://127.0.0.1:8091, e.g. `PORT=8091 npm start`, or set BASE)
import { chromium } from 'playwright';
const B = process.env.BASE || 'http://127.0.0.1:8091/';
const A1 = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', A2 = 'C7abt7Qk6giqzG3G7PuVfvPio2H4u6QiYTJiiutdnX4M';
let fails = 0; const check = (name, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };

import { mkdirSync } from 'node:fs';
mkdirSync(process.env.SHOTS || 'test/shots', { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
// the mock wallet: trusts the site after the first connect, signs with a fixed 64-byte signature; the address comes from localStorage so a test can switch wallets
await ctx.addInitScript(() => {
  const pk = () => ({ toString: () => localStorage.getItem('mock-addr') });
  window.solana = {
    isPhantom: true, isConnected: false, publicKey: null, signed: [],
    async connect(o) { if (o && o.onlyIfTrusted && localStorage.getItem('mock-trusted') !== localStorage.getItem('mock-addr')) throw new Error('not trusted'); localStorage.setItem('mock-trusted', localStorage.getItem('mock-addr')); this.isConnected = true; this.publicKey = pk(); return { publicKey: this.publicKey }; },
    async disconnect() { this.isConnected = false; this.publicKey = null; localStorage.removeItem('mock-trusted'); },
    async signMessage(m) { window.__signed = new TextDecoder().decode(m); return { signature: new Uint8Array(64).fill(7) }; },
    on() { },
  };
});
const p = await ctx.newPage(), errs = [];
p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|geckoterminal/.test(m.text())) errs.push(m.text()); });
await p.goto(B + 'index.html'); await p.evaluate((a) => localStorage.setItem('mock-addr', a), A1);

// 1. not connected: the button asks for the wallet, the ticket table asks for it too
await p.goto(B + 'new.html'); await p.waitForTimeout(1500);
const btn = () => p.evaluate(() => ({ t: document.querySelector('.k-submit').textContent, d: document.querySelector('.k-submit').disabled, h: document.querySelector('.wallet-btn .w-lbl').textContent }));
let s = await btn(); check('gate: button says connect', s.t === 'Connect wallet to post' && !s.d, JSON.stringify(s));
check('gate: tickets ask for the wallet', (await p.textContent('#mine tbody')).includes('Connect your wallet'));

// 2. connect from the button, then put a block in the safe
await p.click('.k-submit'); await p.waitForTimeout(800);
s = await btn(); check('connected: header shows the address', s.h === '7xKX…gAsU', s.h);
check('connected: posting as line shows', await p.isVisible('.nt-as'));
for (let k = 1; k <= 4; k++) {   // take the first pick that quotes
  await p.click(`.nt-picks button:nth-child(${k})`);
  await p.waitForFunction(() => !document.querySelector('.k-submit').disabled, null, { timeout: 12000 }).then(() => { k = 99; }, () => { });
}
s = await btn(); check('connected: button now puts it in the safe', /safe/.test(s.t) && !s.d, JSON.stringify(s));
await p.click('.k-submit'); await p.waitForTimeout(1000);
const signed = await p.evaluate(() => window.__signed);
check('signed: wallet was asked to sign the terms', !!signed && signed.startsWith('CounterX ticket') && signed.includes('Wallet: ' + A1) && signed.includes('Fee: 1.00 %'), (signed || '').split('\n').slice(0, 3).join(' | '));
check('safe: confirmation shown', (await p.textContent('.nt-done')).includes('In the safe'));
const row1 = await p.textContent('#mine tbody tr');
check('safe: ticket listed under my tickets', /OFFER/.test(row1), row1.replace(/\s+/g, ' ').slice(0, 60));
await p.screenshot({ path: (process.env.SHOTS || 'test/shots') + '/wallet-done.png' });

// 3. a new visit: silent reconnect, tickets are waiting, no click
await p.goto(B + 'new.html#tickets'); await p.waitForTimeout(2000);
s = await btn(); check('reload: reconnects silently', s.h === '7xKX…gAsU', s.h);
check('reload: tickets are back', /OFFER/.test(await p.textContent('#mine tbody')));
await p.goto(B + 'index.html#book'); await p.waitForTimeout(3500);
check('window: my ticket shows as YOURS', /YOURS/.test(await p.textContent('#offers tbody')));

// 4. disconnect: tickets hide, the gate returns
await p.goto(B + 'new.html'); await p.waitForTimeout(1500);
await p.click('.wallet-btn'); await p.click('.wmenu [data-w=out]'); await p.waitForTimeout(500);
s = await btn(); check('disconnect: label back to Connect', s.h === 'Connect', s.h);
check('disconnect: tickets hidden', (await p.textContent('#mine tbody')).includes('Connect your wallet'));
await p.goto(B + 'index.html#book'); await p.waitForTimeout(3000);
check('disconnect: window shows no YOURS', !/YOURS/.test(await p.textContent('#offers tbody')));

// 5. another wallet on the same browser sees none of them
await p.evaluate((a) => localStorage.setItem('mock-addr', a), A2);
await p.goto(B + 'new.html'); await p.waitForTimeout(1200); await p.click('.wallet-btn'); await p.waitForTimeout(800);
check('other wallet: starts empty', /Nothing in the safe yet/.test(await p.textContent('#mine tbody')));

check('no console errors', errs.length === 0, errs.join(' | '));
await browser.close();
if (fails) { console.error(fails + ' failing checks'); process.exit(1); }
