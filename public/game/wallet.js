// Snowmoon Forever — GPL-3.0-or-later. See LICENSE.
// Wallet layer for the WebGL page (CLAUDE.md §2.1). Unity calls SnowmoonWallet.call(method, "id|arg") through
// SnowmoonWallet.jslib; every result goes back with SendMessage("SnowmoonWallet", "OnWalletEvent", json).
//   injected       browser extensions and wallet in-app browsers (window.ethereum, EIP-1193)
//   walletconnect  WalletConnect v2 via Reown AppKit for phone wallets (needs walletConnectProjectId in config.js)
// Only three things ever happen here: read the address, switch/add the chain, sign the SIWE text (personal_sign).
// No transactions, no custodial or embedded wallets (D3).
(function () {
  var provider = null;     // the connected EIP-1193 provider
  var address = null;
  var appKit = null;

  function cfg() { return window.SNOWMOON_CONFIG || {}; }

  function reply(id, fields) {
    var msg = Object.assign({ id: id, ok: true }, fields);
    if (window.unityInstance) window.unityInstance.SendMessage("SnowmoonWallet", "OnWalletEvent", JSON.stringify(msg));
  }

  function fail(id, err) {
    var code = err && err.code;
    var text = (err && (err.shortMessage || err.message)) || String(err || "Something went wrong.");
    if (code === 4001 || /rejected|denied|cancel/i.test(text)) text = "You declined the request in your wallet.";
    reply(id, { ok: false, error: text });
  }

  function hexChain(id) { return "0x" + Number(id).toString(16); }

  function toHex(str) {
    var bytes = new TextEncoder().encode(str), out = "0x";
    for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
    return out;
  }

  async function connectInjected(id) {
    if (!window.ethereum) throw new Error("No browser wallet found. Install one, or open this page in your wallet app's browser.");
    provider = window.ethereum;
    var accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts.length) throw new Error("The wallet didn't share an account.");
    address = accounts[0];
    var chain = await provider.request({ method: "eth_chainId" });
    reply(id, { address: address, chainId: parseInt(chain, 16), kind: "injected" });
  }

  // WalletConnect v2 through Reown AppKit (loaded from the CDN only when a project id is configured).
  // NOTE: needs a real project id and a device test before launch (docs/auth.md).
  async function connectWalletConnect(id) {
    var c = cfg();
    if (!c.walletConnectProjectId) throw new Error("WalletConnect isn't set up yet.");
    if (!appKit) {
      var mod = await import("https://cdn.jsdelivr.net/npm/@reown/appkit-cdn@1/dist/appkit.js");
      var chain = {
        id: c.chainId, name: c.chainName, nativeCurrency: c.nativeCurrency,
        rpcUrls: { default: { http: [c.rpcUrl] } },
        blockExplorers: c.explorerUrl ? { default: { name: "Explorer", url: c.explorerUrl } } : undefined,
      };
      var adapter = new mod.WagmiAdapter({ projectId: c.walletConnectProjectId, networks: [chain] });
      appKit = mod.createAppKit({
        adapters: [adapter], networks: [chain], projectId: c.walletConnectProjectId,
        metadata: { name: "Snowmoon Forever", description: "Unofficial fan adaptation of Snowmoon", url: location.origin, icons: [] },
        features: { email: false, socials: false },   // D3: wallet connect only
      });
    }
    await appKit.open();
    address = await new Promise(function (resolve, reject) {
      var done = false;
      var unsub = appKit.subscribeAccount(function (acc) {
        if (!done && acc && acc.isConnected && acc.address) { done = true; unsub && unsub(); resolve(acc.address); }
      });
      setTimeout(function () { if (!done) { done = true; reject(new Error("WalletConnect timed out.")); } }, 180000);
    });
    provider = appKit.getWalletProvider();
    var chain = provider ? await provider.request({ method: "eth_chainId" }) : hexChain(c.chainId);
    reply(id, { address: address, chainId: parseInt(chain, 16), kind: "walletconnect" });
  }

  async function switchChain(id, chainId) {
    if (!provider) throw new Error("Connect a wallet first.");
    var c = cfg();
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain(chainId) }] });
    } catch (e) {
      // 4902: the wallet doesn't know this chain yet; add it (needs rpcUrl in config.js).
      if ((e && e.code === 4902) && c.rpcUrl) {
        await provider.request({ method: "wallet_addEthereumChain", params: [{
          chainId: hexChain(chainId), chainName: c.chainName, nativeCurrency: c.nativeCurrency,
          rpcUrls: [c.rpcUrl], blockExplorerUrls: c.explorerUrl ? [c.explorerUrl] : [],
        }] });
      } else throw e;
    }
    reply(id, { chainId: Number(chainId) });
  }

  async function sign(id, message) {
    if (!provider || !address) throw new Error("Connect a wallet first.");
    var signature = await provider.request({ method: "personal_sign", params: [toHex(message), address] });
    reply(id, { signature: signature, address: address });
  }

  async function disconnect(id) {
    try { if (appKit) await appKit.disconnect(); } catch (e) {}
    provider = null; address = null;
    reply(id, {});
  }

  window.SnowmoonWallet = {
    call: function (method, packed) {
      var bar = packed.indexOf("|");
      var id = bar < 0 ? packed : packed.slice(0, bar);
      var arg = bar < 0 ? "" : packed.slice(bar + 1);
      var run;
      switch (method) {
        case "connect": run = arg === "walletconnect" ? connectWalletConnect(id) : connectInjected(id); break;
        case "switchChain": run = switchChain(id, arg); break;
        case "sign": run = sign(id, arg); break;
        case "disconnect": run = disconnect(id); break;
        default: run = Promise.reject(new Error("Unknown wallet call " + method));
      }
      run.catch(function (e) { fail(id, e); });
    },
  };

  // Account or chain changed in the wallet: the game signs in again on the next action.
  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on("accountsChanged", function (a) { if (address && (!a.length || a[0].toLowerCase() !== address.toLowerCase())) address = null; });
  }
})();
