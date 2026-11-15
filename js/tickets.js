// CounterX · the safe, as one wallet sees it: every offer and bid that wallet put in, with its terms and expiry.
// Tickets live under the wallet's address, so connecting the same wallet brings them back.
const key = (addr) => 'counterx.tickets.v2:' + addr;
const read = (addr) => { if (!addr) return []; try { return JSON.parse(localStorage.getItem(key(addr)) || '[]'); } catch { return []; } };
const write = (addr, xs) => { try { localStorage.setItem(key(addr), JSON.stringify(xs)); } catch { } };

export function tickets(addr) { const now = Date.now(); return read(addr).filter((t) => !t.expires || t.expires > now).sort((a, b) => b.t - a.t); }
export function addTicket(addr, t) {
  const xs = read(addr), id = 'T' + Date.now().toString(36).toUpperCase();
  xs.push({ ...t, id, t: Date.now(), owner: addr }); write(addr, xs); return id;
}
export function cancelTicket(addr, id) { write(addr, read(addr).filter((t) => t.id !== id)); }
