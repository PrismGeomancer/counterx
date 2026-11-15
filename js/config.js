// CounterX · the only place for links and ids. Empty means "not published": the UI hides it or prints "—".
window.COUNTERX = {
  ticker: 'COUNTERX',
  mint: '',            // $COUNTERX mint. Empty hides the CA button and the burn value.
  programId: '',       // the CounterX escrow program. Empty: book, fills and burn show their closed / "—" states.
  cluster: 'devnet',   // 'mainnet-beta' removes the devnet tags from program numbers.
  rpc: '',             // RPC for the program (Phase 3).
  floorWs: '',         // optional domain-restricted websocket for a live floor layer (Phase 2).
  x: 'Counterx_',      // X handle, no @. Empty hides every X link.
  telegram: '',        // t.me path. Empty hides the button.
  repo: '',
  basePath: '',        // '' for a custom domain or relative hosting; '/counterx/' style prefix if needed.

  // Market reads for the hero quote. These are mainnet pump.fun coins, independent of the program cluster.
  heroRpc: 'https://solana-rpc.publicnode.com',   // keyless, allows browser origins (api.mainnet-beta returns 403 to browsers)
  heroCoins: [
    '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump', '4CxjZyMNoF1p6eXHXHv1TWpS2X47CuUmLwtGe18spump',
    'HsprHxBRgiVaQdRf3TnKNuZZtaX9JUSPgMFdAkk6pump', '91fBfFGRG5Ry6ty4A1Q23hv1eEawsTu7rh2mvczRpump',
    '2j5SaS7xy776qCBpyPQbZjyQSAtKiFgrwjfErthnW2ZM', 'Ai66LHZG9MCzg1WKdawwqduVAXpNDUuV8M3uyq5ppump',
    '4iJ7xEQrUvVUQH9KVStvw3FaY2PZDd7RtR4L9zx2pump', 'uHMWNFjUNxbPy1q43WrdbzygmJwdeh6AiQm1NKdxPAY',
    'BLVpn8ofkjnAzpWGaVpspZ5bHTeXDbXFgX4vn3fkpump', 'DFG7SwUG9cFCgRSWKgQVQqHwjdTVg5FYZDLZDejQpump',
    'AeG2JrKhnqsWgYoJza7yQ67jDr21taqyPiGrvgm2pump',
  ],
  bagPct: 5,
  rotateMs: 12000,
  fees: { curve: 0.0125, pool: 0.003 },  // swap fee assumed in the floor quote, as a fraction
  counterFeeBps: 100,                    // 1.00 % on the SOL leg
  pollMs: 15000,
  floorPollMs: 60000,   // how often an open page looks for a newer floor snapshot
};
