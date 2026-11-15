// CounterX · the wallet is the login. Connect once and the site remembers: next visit it reconnects silently
// (only if the wallet already trusts this site), and the visitor's tickets are waiting under their address.
// No imports, so every page can load it.
const KEY = 'counterx.wallet';
let provider = null, address = null;
const subs = new Set();

const find = () => { const w = globalThis; return (w.phantom && w.phantom.solana) || w.solflare || (w.backpack && w.backpack.solana) || w.solana || null; };
const emit = () => subs.forEach((f) => { try { f(address); } catch (e) { console.error('[counterx]', e); } });
const remember = (on) => { try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch { } };
const wasConnected = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
function bind(p) {
  if (p._cx) return; p._cx = 1;
  if (!p.on) return;
  p.on('accountChanged', (pk) => { address = pk ? pk.toString() : null; if (!address) provider = null; emit(); });
  p.on('disconnect', () => { provider = null; address = null; emit(); });
}

export const wallet = {
  get address() { return address; },
  get installed() { return !!find(); },
  // subscribe; the callback runs now with the current address, then on every change
  on(fn) { subs.add(fn); try { fn(address); } catch (e) { console.error('[counterx]', e); } return () => subs.delete(fn); },
  async connect(opts) {
    const p = find(); if (!p) throw Object.assign(new Error('no wallet'), { code: 'NO_WALLET' });
    const r = await p.connect(opts), pk = (r && r.publicKey) || p.publicKey;
    if (!pk) throw new Error('no key');
    provider = p; address = pk.toString(); remember(true); bind(p); emit(); return address;
  },
  async disconnect() { try { if (provider && provider.disconnect) await provider.disconnect(); } catch { } provider = null; address = null; remember(false); emit(); },
  // on page load: if this wallet connected here before, reconnect without a prompt
  async restore() {
    if (!wasConnected()) return;
    for (let i = 0; i < 8 && !find(); i++) await new Promise((r) => setTimeout(r, 250));   // extensions can inject a moment after load
    if (!find()) return;
    try { await wallet.connect({ onlyIfTrusted: true }); } catch { remember(false); }
  },
  // ask the wallet to sign a message (free, no transaction). Returns base64, or null if this wallet cannot sign messages.
  async sign(text) {
    if (!provider) throw new Error('not connected');
    if (!provider.signMessage) return null;
    const r = await provider.signMessage(new TextEncoder().encode(text), 'utf8'), sig = (r && r.signature) || r;
    let s = ''; for (const b of sig) s += String.fromCharCode(b); return btoa(s);
  },
};
