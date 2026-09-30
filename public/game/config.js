// Snowmoon Forever — GPL-3.0-or-later. Per-deployment page config (no secrets: everything here is public).
// apiBase empty = the offline guest build. Local testing against `dotnet run` in /server: "http://localhost:5144".
// Development uses Robinhood Chain testnet 46630 with a mock $CREATIONS (CLAUDE.md rule 8); mainnet 4663 only after
// Tyler signs off.
window.SNOWMOON_CONFIG = {
  apiBase: "https://snowmoon-api.indiecreations.fun",
  chainId: 46630,
  chainName: "Robinhood Chain Testnet",
  // Needed only when a wallet doesn't know the chain yet (wallet_addEthereumChain). Fill in from the chain's docs.
  rpcUrl: "",
  explorerUrl: "",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  // WalletConnect v2 (Reown AppKit) project id from cloud.reown.com; empty hides the phone-wallet button.
  walletConnectProjectId: "658647e346dc31c2fd87d6ececaacf91",
  walletHelpUrl: "https://ethereum.org/en/wallets/find-wallet/",
};
