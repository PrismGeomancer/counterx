// CounterX · the shared header and footer, injected into every page (one source, no build step).
export const HEADER = `<header class="hdr"><div class="wrap hdr-in">
  <a class="mark" href="index.html" aria-label="CounterX home"><img src="img/logo.svg" alt="" width="28" height="28"><b>COUNTER<i>X</i></b></a>
  <nav class="nav" aria-label="Main"><a href="index.html#book">Window</a><a href="coins.html" data-nav="coins">Coins</a><a href="#" data-soon>Locks</a><a href="index.html#tape">Ledger</a><a href="index.html#how">How it works</a><a class="nav-x" data-social="x" hidden target="_blank" rel="noopener">X <span aria-hidden="true">↗</span></a></nav>
  <form class="ca-search" role="search"><span aria-hidden="true"><svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="6" r="4.5"/><path d="m9.5 9.5 3 3"/></svg></span><input name="q" placeholder="Paste a CA or ticker" aria-label="Paste a CA or ticker" autocomplete="off" spellcheck="false"><kbd>/</kbd></form>
  <div class="hdr-r">
    <span class="sol-px" hidden title="SOL / USD"><span class="dot"></span><span class="v">SOL —</span></span>
    <button class="ca-btn" type="button" hidden title="Copy the $COUNTERX contract address">$COUNTERX <span class="ca-v">—</span><svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="4.5" y="4.5" width="8" height="8"/><path d="M9.5 4.5v-3h-8v8h3"/></svg></button>
    <a class="ico-btn" data-social="x" hidden target="_blank" rel="noopener" aria-label="CounterX on X"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.9-6.4L6.3 22H3.2l7.3-8.3L1 2h6.4l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z"/></svg></a>
    <a class="btn btn-au btn-sm hide-sm" href="new.html">Post an offer</a>
    <button class="btn btn-ln btn-sm wallet-btn" type="button"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="1.5" y="3.5" width="13" height="10"/><path d="M1.5 6.5h13M11 10h1.5"/></svg><span class="w-lbl">Connect</span></button>
    <button class="burger" type="button" aria-label="Menu" aria-expanded="false"><span></span></button>
  </div>
</div>
<div class="sheet"><div class="wrap">
  <a href="index.html#book">Window</a><a href="coins.html" data-nav="coins">Coins</a><a href="#" data-soon>Locks</a><a href="index.html#tape">Ledger</a><a href="index.html#how">How it works</a><a href="new.html#tickets">My tickets</a><a data-social="x" hidden target="_blank" rel="noopener">X (Twitter) ↗</a><a href="new.html" class="btn btn-au">Post an offer</a>
</div></div>
</header>
`;
export const FOOTER = `<footer class="ftr"><div class="wrap">
  <div class="ftr-top">
    <div class="ftr-b"><a class="mark" href="index.html"><img src="img/logo.svg" alt="" width="28" height="28"><b>COUNTER<i>X</i></b></a><p>The counter for Solana tokens. Both legs cross in one program instruction; the floor never hears the order.</p>
      <div class="soc"><a class="ico-btn" data-social="x" hidden target="_blank" rel="noopener" aria-label="CounterX on X"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.9-6.4L6.3 22H3.2l7.3-8.3L1 2h6.4l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z"/></svg></a><a class="ico-btn" data-social="telegram" hidden target="_blank" rel="noopener" aria-label="CounterX on Telegram"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.7 19.5c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.2-8.3c.4-.4-.1-.6-.6-.2L6.1 13.1 1.2 11.6c-1-.3-1.1-1 .2-1.5L20.6 2.7c.9-.3 1.6.2 1.3 1.6Z"/></svg></a></div>
    </div>
    <nav aria-label="Trade"><h3>Trade</h3><a href="index.html#book">Window</a><a href="new.html">Post an offer</a><a href="new.html?side=bid">Place a bid</a><a href="coins.html" data-nav="coins">Coins</a></nav>
    <nav aria-label="Public record"><h3>Public record</h3><a href="index.html#tape">Ledger tape</a><a href="#" data-soon>Locks</a><a href="index.html#tape">Ledger</a><a href="new.html#tickets">My tickets</a></nav>
    <nav aria-label="Program"><h3>Program</h3><a href="index.html#how">How it works</a><a href="#" data-soon>Safe mints</a><a href="index.html#how">Fees</a><a href="#" data-soon>Program ID</a></nav>
  </div>
  <div class="ftr-bot"><span>© CounterX</span><span class="num" data-k="pid">program —</span><span class="risk">Not financial advice. Meme coins can lose all their value. Verify the contract on our official X.</span></div>
</div></footer>
`;
