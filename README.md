# CounterX ($COUNTERX)

Block trades for pump.fun tokens, off the pool. This is a static site with no server and no build step, hosted on GitHub Pages.

**Built so far:**
- **Phase 1:** the homepage and the live hero quote.
- **Phase 2:** the floor, from a 24 h snapshot plus a live layer in each visitor's browser.

**Not built yet:**
- **Phase 3:** the program integration (book, fills, wallet transactions, burn).
- **Phase 4:** the inner pages.

Until the program exists, *Over the counter* and *The window* show real floor data re-quoted at the counter. These rows carry a **WHAT IF** label and are never presented as CounterX trades.

## What runs where

| Part | Runs in | Source |
|---|---|---|
| Hero quote (the teller window) | the visitor's browser | DexScreener (coin list, pair address) → Solana RPC `getMultipleAccounts` on the pump.fun bonding curve or PumpSwap pool → `js/quote.js` constant-product maths. If RPC fails, it uses DexScreener's pool liquidity. If that fails too, it uses `data/hero-snapshot.json`, labelled with its time. |
| Price history in the hero chart | browser | GeckoTerminal minute OHLCV (keyless) |
| SOL / USD chip | browser | Jupiter price API, then DexScreener. Hidden if both fail. |
| Floor snapshot (24 h) | GitHub Action, every ~10 min → `data/floor.json`, `bands.json`, `coins.json` inside the Pages artifact | `scripts/floor.mjs`, see the steps below. |
| Live floor | the visitor's browser (`js/floorlive.js`) | The same engine walks the 24 busiest pools, one GeckoTerminal call every ~6.5 s, confirms each new big trade with `getTransaction`, and slides it into the floor, the bands, the hero feed and the what-if sections. |
| Over the counter (what if) | browser, from the floor rows | The day's 10 floor sells that lost the most SOL, re-quoted at the counter: same block, the price before the sell, 1.00 % fee. |
| The window (what if) | snapshot + browser | **Offers:** what selling a big bag would do on the floor at the last confirmed reserves. Without a key that is a 5 % bag; with `HELIUS_API_KEY` it is the largest non-pool holder bag (public RPCs refuse `getTokenLargestAccounts`). **Bids:** the day's big floor buys, and how far they pushed the price. |
| Real offers, bids, fills, volume, burn | browser, reading the program | **Phase 3.** The strip shows `—` for these until then. |

### How the floor is measured (`js/floor.js`)

1. **Pick the pools.** GeckoTerminal ranks pump.fun pools by 24 h volume (pools under $1,000 are dropped; ranking by transaction count favoured bot-spammed copycats): PumpSwap pools (`pumpswap`) and bonding curves (`pump-fun`).
2. **Find the big trades.** For each pool, take the recent trades filtered by USD size, and keep those of ≥ 1 % of supply.
3. **Read each trade's transaction.** `getTransaction` gives the pool's balances before and after the trade.
   - **PumpSwap:** the vault token balances.
   - **Curve:** the token account balance + 73,000,000, and the lamports − rent + 30 SOL, which gives the virtual reserves.

   Impact is the observed price change. SOL lost is (tokens × the price before) − the SOL received. No fee is assumed.
4. **Skip what doesn't match.** If the pool's balance change doesn't match the trade's own legs within 10 %, the transaction held other swaps, and the trade is skipped rather than mis-measured. On a typical run this drops ~75 % of candidates. Most are **wash trades**: volume bots buying and selling the same block inside one transaction, so the pool barely moves. The rest are **bundles** (several buys in one transaction). Both are kept off the floor.
5. **Merge and stay honest about coverage.** The snapshot merges the previously deployed one, which keeps a rolling 24 h. `since` says honestly how far back coverage goes, and the UI prints "Since HH:MM UTC" until it covers 24 h.
6. **Refresh every ~10 minutes.**
   - **Quick refresh:** each run rescans only the busiest pools and reads only trades it has not judged before. Trades it read and rejected (wash round-trips, bundles) are remembered by a 12-character signature prefix in `skip`, so they are not read again. A quick refresh takes about 6 minutes.
   - **Full scan:** about once an hour, or when there is no snapshot under an hour old, it scans every hot pool (about 8 minutes). `FULL=1` forces one.
   - **Pacing:** GeckoTerminal allows roughly 9 calls a minute, so scan time is mostly waiting.
   - **In the page:** an open page looks for a newer snapshot every minute (`floorPollMs`) and slides the new trades into the floor and Over the counter. The strip says when the data is from.

Pump.fun account layouts were checked on mainnet on 2026-11-12:
- **Curve:** virtual token and SOL reserves as u64 LE at offsets 8 and 16; total supply at 40.
- **PumpSwap pool:** base mint at offset 43, base vault at 139, quote vault at 171.

## Pages

| Page | What it shows |
|---|---|
| `index.html` | Hero (the teller window), the strip, No. 01 the floor, No. 02 over the counter (what if), No. 03 the window (what if), No. 04 how it works. |
| `coins.html` | The busiest pump.fun coins today. For each: market cap, 1 h volume, its big sells and their median impact, and what a 5 % sell would do now (live reserves, refreshed every minute). Sortable and filterable. |
| `new.html` | **Post an offer / place a bid.** The wallet is the login: connect it, set a size and a price (live quote against the pool), and the wallet signs the terms in plain words. The ticket goes in the safe and is listed under **My tickets**, and at the window as YOURS. Reconnecting the same wallet on a later visit brings its tickets back. |
| `coin.html#<mint>` | One coin. **The cost of size:** 0.5–10 % of supply on the floor vs at the counter, from live reserves every 20 s. Its 1 h price, its 1 %+ trades over 24 h (kept live), and the window. Any coin name in the tables links here. Search takes a CA or a ticker. |

Locks, Safe mints and Program ID still say "Coming soon", because they need the CounterX program.

## Wallet and tickets

- **Login:** the wallet is the whole login. The first connect asks the wallet; later visits reconnect silently when the wallet already trusts the site (`onlyIfTrusted`), so the visitor's tickets are simply there.
- **Sign, don't send:** posting asks the wallet for a free message signature over the ticket's terms (side, coin, size, price, smallest fill, expiry, who can fill it, fee, wallet). No transaction, no SOL moves.
- **Where tickets live:** each ticket is saved in the visiting browser under the wallet's address (`js/tickets.js`). Another browser or device starts empty until the CounterX program exists and tickets move on chain.
- **Test:** `npm run wallet` drives a mock wallet through connect, sign, silent reconnect, a second wallet seeing nothing, and disconnect. It needs the site on `http://127.0.0.1:8091` (`PORT=8091 npm start`) or `BASE=...`.

## Helius key (recommended)

With the key set, the Action reads every candidate trade per run (budget 1,200 instead of 350) and fills the window's offers with the real largest holder bag of each busy coin.

- **On GitHub:** **Settings → Secrets and variables → Actions → New repository secret**, named `HELIUS_API_KEY`.
- **Locally:** put `HELIUS_API_KEY=...` in `.env`. The file is git-ignored, and `scripts/floor.mjs` reads it.
- **Never in client code:** the key never goes into `js/config.js` or anything the browser loads.

## Configure

`js/config.js` is the only place for links and ids:

```js
mint: '',        // $COUNTERX mint → shows the CA button
programId: '',   // CounterX program → enables the window / ledger (Phase 3)
cluster: 'devnet',  // 'mainnet-beta' removes the devnet tags
x: '', telegram: '',  // empty hides the buttons
heroRpc: 'https://solana-rpc.publicnode.com',  // keyless and browser-friendly; max 10 accounts per call (the code batches)
heroCoins: [...],  // the mints the teller window rotates through
fees: { curve: 0.0125, pool: 0.003 },  // swap fee assumed in the floor quote
```

There are no secrets in client code. A paid RPC key must never go in `config.js`. Use a domain-restricted key if you add one.

## Run locally

```bash
npm install              # Playwright, for the smoke test and brand export only
npm start                # http://localhost:8080 with the floor refreshed every 10 min (starts a run now; runs are chained, never overlapped)
npm run serve            # http://localhost:8080, files only
npm test                 # unit tests: quote maths vs recorded engine output, bands, groups(), formatters, account decoders
npm run smoke            # Playwright at 320/375/768/1280/1600 px × offline / fixtures / live: no console errors, no h-scroll
npm run brand            # re-export img/icon-*.png and img/og.png from img/logo.svg
```

## Deploy to GitHub Pages

1. Push to `main`.
2. In **Settings → Pages**, set **Source: GitHub Actions**.

`.github/workflows/pages.yml` runs the unit tests and publishes only the site files: `index.html`, `404.html`, `css`, `js`, `fonts`, `img` and `data`. Every URL is relative, so the site works at `user.github.io/counterx/` and on a custom domain. `404.html` sends old path URLs (`/desk`, `/coin/<mint>`, …) to the matching section.

## Limitations

- **There is no CounterX program yet.** Tickets are signed by the wallet and saved in the visiting browser under its address. Nothing is on chain until a program exists.
- **The floor covers the busiest pools, not every pump.fun coin.** That's about 40 pools by default (`POOL_PAGES` / `CURVE_PAGES`). Each run reads at most `MAX_TX` transactions (default 350, newest first); the unread older trades narrow `since`.
- **Scheduled runs can be late.** GitHub may delay or skip scheduled workflows. The live layer covers the gap while someone has the page open.
- **GeckoTerminal throttles bursts.** The Action paces its calls at ~9 a minute, and a run over ~40 pools takes ~5 min. Each visitor's browser makes about 9 calls a minute.
- **Optional Helius key.** Setting the `HELIUS_API_KEY` repository secret sends the Action's `getTransaction` calls to Helius, so they're faster with fewer 429s. The key is never shipped to the browser.
- **Public RPCs rate-limit.** PublicNode caps `getMultipleAccounts` at 10 accounts per call. `api.mainnet-beta.solana.com` returns 403 to browsers. If RPC is down, the hero falls back to DexScreener reserves and says so.
- **Pump.fun swap fees vary by market cap.** The floor quote uses the fee in `config.fees`, and the hero shows it next to every quote.
- **Fonts:** Fraunces, Instrument Sans and JetBrains Mono, all under the SIL Open Font License and self-hosted in `/fonts`.
