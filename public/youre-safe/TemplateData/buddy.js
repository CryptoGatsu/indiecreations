// Don't Worry, You're Safe! - the host page's services for the Unity build (window.BuddyHost), called from
// Assets/Plugins/WebGL/BuddyBridge.jslib. Modeled on My Favorite Sheep's mfs.js: the same site routes, the same wallet
// flow, so a purchase here is an ordinary indiecreations.fun order (and counts toward the holder revenue share).
//
//   BuddyHost.call(method, args) -> Promise<object>   (the jslib hands the result to Unity as JSON)
//     session     -> { ok, wallet, balance, entitlements[] }   who is signed in (cookie ic_player) and what they own
//     connect     -> same, after connecting the browser wallet and signing the free sign-in message
//     disconnect  -> { ok }
//     price       -> { ok, usdPerToken, source, fetchedAt, note } or { ok:false, error } while checkout is paused
//     quote       -> { ok, orderId, sku, usdPrice, tokenAmount, tokenAmountDisplay, rate, expiresAt }   (10 minutes)
//     purchase    -> { ok, txHash, stage:'sent' }   ERC-20 transfer of exactly the quoted amount to the treasury
//     verify      -> { ok, status:'paid'|'pending'|'failed', sku }   /api/shop/confirm: the site checks the chain
//     save / load -> /api/buddy/save (load: { ok, version, stateJson, updatedAt })
//     voice       -> /api/buddy/voice (Inner Voice, server-side model): { ok, kind, text }
//
// Keys never touch Unity or this page: signing and paying happen in the player's own wallet, the site decides what is
// owned (it watches the chain), and premium items are never granted by the client.
(function () {
  'use strict';

  var CHAIN = { id: 4663, hex: '0x1237', name: 'Robinhood Chain', rpc: 'https://rpc.mainnet.chain.robinhood.com', explorer: 'https://robinhoodchain.blockscout.com' };
  var GAME = "Don't Worry, You're Safe!";
  var PAGE_PATH = '/youre-safe';
  var PENDING_KEY = 'youre-safe.pendingPayments';
  var NOTE = '20% of every purchase is burned  ·  25% of revenue goes to $CREATIONS holders';

  var coarse = false;
  try { coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; } catch (e) {}

  // EIP-6963: wallets announce themselves; window.ethereum is the fallback (and what in-app wallet browsers inject)
  var announced = [];
  window.addEventListener('eip6963:announceProvider', function (e) { if (e && e.detail && e.detail.provider) announced.push(e.detail); });
  try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch (e) {}
  function provider() {
    if (window.ethereum && typeof window.ethereum.request === 'function') return window.ethereum;
    return announced.length ? announced[0].provider : null;
  }

  // ---------------------------------------------------------------- helpers
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var err = new Error(json.error || json.message || ('Request failed (' + res.status + ').'));
          err.status = res.status; err.body = json;
          throw err;
        }
        json.__status = res.status;
        return json;
      });
    });
  }
  function utf8Hex(text) {
    var bytes = new TextEncoder().encode(text), out = '0x';
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return out;
  }
  function pad32(hex) { hex = hex.replace(/^0x/, '').toLowerCase(); while (hex.length < 64) hex = '0' + hex; return hex; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function short(a) { return a ? a.slice(0, 6) + '...' + a.slice(-4) : ''; }

  function walletError(e) {
    var code = e && (e.code || (e.data && e.data.code));
    if (code === 4001 || code === 'ACTION_REJECTED') return 'You cancelled in your wallet.';
    if (code === -32002) return 'Your wallet already has a request open - check it.';
    var msg = (e && (e.shortMessage || e.message)) || String(e);
    if (/insufficient funds/i.test(msg)) return 'Not enough ETH on Robinhood Chain for the network fee.';
    if (/transfer amount exceeds balance|exceeds balance/i.test(msg)) return 'Not enough $CREATIONS in this wallet.';
    return msg.length > 160 ? msg.slice(0, 157) + '...' : msg;
  }
  function fail(e) { return { ok: false, error: e && e.status ? e.message : walletError(e) }; }

  // game SKU buddy.<item_id>  <->  site catalog id ys-<item-id>   (lib/buddy.js on the site)
  function skuToId(sku) { return /^buddy\.[a-z0-9_]+$/.test(sku || '') ? 'ys-' + sku.slice(6).replace(/_/g, '-') : null; }
  function idToSku(id) { return /^ys-[a-z0-9-]+$/.test(id || '') ? 'buddy.' + id.slice(3).replace(/-/g, '_') : null; }

  function unity() { return window.unityInstance || null; }
  function notify(evt) { var u = unity(); if (u) try { u.SendMessage('BuddyBridge', 'OnHostEvent', evt); } catch (e) {} }

  // ---------------------------------------------------------------- wallet
  function accounts(p, ask) {
    return p.request({ method: ask ? 'eth_requestAccounts' : 'eth_accounts' }).then(function (a) { return (a && a[0]) ? String(a[0]) : null; });
  }
  function ensureChain(p) {
    return p.request({ method: 'eth_chainId' }).then(function (id) {
      if (parseInt(id, 16) === CHAIN.id) return;
      return p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hex }] }).catch(function (e) {
        if (!(e && (e.code === 4902 || (e.data && e.data.originalError && e.data.originalError.code === 4902)))) throw e;
        return p.request({
          method: 'wallet_addEthereumChain',
          params: [{ chainId: CHAIN.hex, chainName: CHAIN.name, rpcUrls: [CHAIN.rpc], blockExplorerUrls: [CHAIN.explorer],
                     nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }]
        });
      });
    });
  }

  function signIn() {
    var p = provider();
    if (!p) { showWalletSheet('signin'); return Promise.reject(new Error(noWalletText('sign in'))); }
    return accounts(p, true).then(function (address) {
      if (!address) throw new Error('Your wallet returned no account.');
      return api('/api/game/signin?address=' + encodeURIComponent(address)).then(function (n) {
        return p.request({ method: 'personal_sign', params: [utf8Hex(n.message), address] }).then(function (signature) {
          return api('/api/game/signin', { method: 'POST', body: { address: address, issuedAt: n.issuedAt, signature: signature } });
        });
      });
    });
  }

  // $CREATIONS balance of the signed-in wallet, for display only (0 when there is no wallet in this browser).
  function balanceOf(address, token) {
    var p = provider();
    if (!p || !token) return Promise.resolve(0);
    return p.request({ method: 'eth_chainId' }).then(function (id) {
      if (parseInt(id, 16) !== CHAIN.id) return 0;
      return p.request({ method: 'eth_call', params: [{ to: token, data: '0x70a08231' + pad32(address) }, 'latest'] })
        .then(function (hex) { return Number(BigInt(hex || '0x0') / 1000000000000000000n); });
    }).catch(function () { return 0; });
  }

  var catalogCache = null, catalogAt = 0;
  function catalog(force) {
    if (!force && catalogCache && Date.now() - catalogAt < 30000) return Promise.resolve(catalogCache);
    return api('/api/game/catalog?game=' + encodeURIComponent(GAME)).then(function (c) { catalogCache = c; catalogAt = Date.now(); return c; });
  }

  var token = '0xB9195597f91f179EBB05D3F1765B35C3d8491aCb';   // $CREATIONS on Robinhood Chain (public CA; quotes carry it too)
  function session(force) {
    return api('/api/game/me').then(function (me) {
      if (!me.address) return { ok: false };
      return catalog(force).then(function (c) {
        var owned = (c.items || []).filter(function (i) { return i.owned; }).map(function (i) { return idToSku(i.id); }).filter(Boolean);
        return balanceOf(me.address, token).then(function (bal) {
          return { ok: true, wallet: me.address.toLowerCase(), isHolder: false, balance: bal, entitlements: owned };
        });
      });
    });
  }

  // ---------------------------------------------------------------- payments
  function loadPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch (e) { return []; } }
  function savePending(list) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch (e) {} }
  function addPending(p) { var l = loadPending().filter(function (x) { return x.orderId !== p.orderId; }); l.push(p); savePending(l); }
  function dropPending(orderId) { savePending(loadPending().filter(function (x) { return x.orderId !== orderId; })); }

  var quotes = {};

  function quote(sku) {
    var itemId = skuToId(sku);
    if (!itemId) return Promise.resolve({ ok: false, error: 'That item is not sold here.' });
    return api('/api/game/quote', { method: 'POST', body: { itemId: itemId } }).then(function (q) {
      quotes[q.orderId] = q;
      token = q.token || token;
      var shown = Math.ceil(Number(q.amount));
      return {
        ok: true, orderId: q.orderId, sku: sku, usdPrice: q.item.usd, tokenAmount: q.amountRaw,
        tokenAmountDisplay: isFinite(shown) ? shown : 0, rate: q.priceUsd, expiresAt: Math.floor(Date.parse(q.expiresAt) / 1000)
      };
    });
  }

  function purchase(orderId) {
    var q = quotes[orderId], p = provider();
    if (!q) return Promise.resolve({ ok: false, error: 'That quote expired - try again.' });
    if (!p) { showWalletSheet('buy'); return Promise.reject(new Error(noWalletText('buy'))); }
    return accounts(p, true).then(function (from) {
      if (!from || from.toLowerCase() !== q.wallet.toLowerCase())
        throw new Error('Your wallet is on ' + short(from) + '. Switch it to ' + short(q.wallet) + ' (the wallet you signed in with) and try again.');
      return ensureChain(p).then(function () { return from; });
    }).then(function (from) {
      var data = '0xa9059cbb' + pad32(q.treasury) + pad32(BigInt(q.amountRaw).toString(16));
      return p.request({ method: 'eth_sendTransaction', params: [{ from: from, to: q.token, data: data, value: '0x0' }] });
    }).then(function (tx) {
      addPending({ orderId: orderId, tx: tx, sku: q.item && q.item.id, at: Date.now() });
      return { ok: true, txHash: tx, stage: 'sent' };
    });
  }

  function verify(orderId, txHash) {
    return api('/api/shop/confirm', { method: 'POST', body: { orderId: orderId, txHash: txHash } }).then(function (r) {
      var q = quotes[orderId];
      var sku = q && q.item ? idToSku(q.item.id) : null;
      if (r.state === 'delivered') { dropPending(orderId); catalogCache = null; return { ok: true, status: 'paid', sku: sku }; }
      return { ok: true, status: 'pending', sku: sku };
    }, function (e) {
      if (e.status && e.status >= 400 && e.status < 500) { dropPending(orderId); return { ok: false, status: 'failed', error: e.message }; }
      return { ok: true, status: 'pending' };   // the site or the chain hiccuped: the game asks again
    });
  }

  // A payment sent just before the page closed: finish it quietly on the next visit, then tell the game.
  function resumePending() {
    var list = loadPending().filter(function (x) { return Date.now() - x.at < 24 * 3600000; });
    savePending(list);
    list.forEach(function (x) {
      var until = Date.now() + 10 * 60000;
      (function attempt() {
        api('/api/shop/confirm', { method: 'POST', body: { orderId: x.orderId, txHash: x.tx } }).then(function (r) {
          if (r.state === 'delivered') { dropPending(x.orderId); catalogCache = null; notify('session'); toast('Your purchase is unlocked.'); }
          else if (Date.now() < until) wait(4000).then(attempt);
        }, function (e) {
          if (e.status && e.status >= 400 && e.status < 500) dropPending(x.orderId);
          else if (Date.now() < until) wait(6000).then(attempt);
        });
      })();
    });
  }

  // ---------------------------------------------------------------- calls from Unity
  var methods = {
    session: function () { return session(false).catch(fail); },
    connect: function () {
      return api('/api/game/me').then(function (me) { return me.address ? null : signIn(); })
        .then(function () { return session(true); }).catch(fail);
    },
    disconnect: function () { return api('/api/game/me', { method: 'DELETE' }).then(function () { return { ok: true }; }).catch(fail); },
    price: function () {
      return catalog(true).then(function (c) {
        if (!c.status || !c.status.open) return { ok: false, error: (c.status && c.status.reason) || 'Checkout is closed right now.', note: NOTE };
        if (!c.priceUsd) return { ok: false, error: 'Live pricing is unavailable right now.', note: NOTE };
        return { ok: true, usdPerToken: c.priceUsd, source: 'live', fetchedAt: Math.floor(Date.now() / 1000), note: NOTE };
      }).catch(fail);
    },
    quote: function (a) { return quote(a.sku).catch(fail); },
    purchase: function (a) { return purchase(a.orderId).catch(fail); },
    verify: function (a) { return verify(a.orderId, a.txHash).catch(fail); },
    save: function (a) { return api('/api/buddy/save', { method: 'POST', body: { version: a.version, state: a.state } }).catch(fail); },
    load: function () {
      // Unity's JSON reader can't take a nested object of unknown shape: hand the state over as a string
      return api('/api/buddy/save').then(function (r) {
        return { ok: true, version: r.version || 0, stateJson: r.state ? JSON.stringify(r.state) : '', updatedAt: r.updatedAt || '' };
      }).catch(fail);
    },
    voice: function (a) { return api('/api/buddy/voice', { method: 'POST', body: { kind: a.kind, summary: a.summary } }).catch(fail); },
    copy: function (a) { copyText(a.text || ''); return Promise.resolve({ ok: true }); }
  };

  function call(method, args) {
    var fn = methods[method];
    if (!fn) return Promise.resolve({ ok: false, error: 'Unknown call ' + method });
    return Promise.resolve().then(function () { return fn(args || {}); }).then(function (r) {
      if (r && typeof r === 'object') delete r.__status;
      return r;
    }, fail);
  }

  // ---------------------------------------------------------------- page chrome (sheets, toasts)
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  var toastTimer = 0;
  function toast(text) {
    var t = document.getElementById('ys-toast');
    if (!t) { t = el('<div id="ys-toast" class="ys-toast" role="status"></div>'); document.body.appendChild(t); }
    t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 5200);
  }
  function noWalletText(what) {
    return coarse ? 'To ' + what + ', open the game in your wallet app - the steps are on screen.'
                  : 'No wallet found in this browser. Install MetaMask, Rabby or Coinbase Wallet, then reload.';
  }
  function showWalletSheet(reason) {
    closeSheet();
    var target = location.origin + PAGE_PATH;
    var hostPath = target.replace(/^https?:\/\//, '');
    var sheet;
    if (!coarse) {
      sheet = el('<div class="ys-sheet-back"><div class="ys-sheet"><h2>No wallet in this browser</h2>' +
        '<p>The CREATIONS shop uses a browser wallet on Robinhood Chain. Install one and reload this page: what you buy belongs to your wallet, in any browser.</p>' +
        '<div class="ys-sheet-buttons"><a class="ys-btn" href="https://metamask.io/download/" target="_blank" rel="noopener">MetaMask</a>' +
        '<a class="ys-btn" href="https://rabby.io/" target="_blank" rel="noopener">Rabby</a>' +
        '<a class="ys-btn" href="https://www.coinbase.com/wallet/downloads" target="_blank" rel="noopener">Coinbase Wallet</a></div>' +
        '<button class="ys-btn ys-quiet" data-close>Not now</button></div></div>');
    } else {
      sheet = el('<div class="ys-sheet-back"><div class="ys-sheet"><h2>' + (reason === 'buy' ? 'Buy in your wallet app' : 'Sign in with your wallet app') + '</h2>' +
        '<p>Open this page in your wallet app\'s browser and ' + (reason === 'buy' ? 'buy there.' : 'sign in there (free, no transaction).') + ' Your buddy\'s items follow your wallet.</p>' +
        '<div class="ys-sheet-buttons">' +
        '<a class="ys-btn" href="https://metamask.app.link/dapp/' + hostPath + '">MetaMask</a>' +
        '<a class="ys-btn" href="https://go.cb-w.com/dapp?cb_url=' + encodeURIComponent(target) + '">Coinbase Wallet</a>' +
        '<a class="ys-btn" href="https://link.trustwallet.com/open_url?coin_id=60&url=' + encodeURIComponent(target) + '">Trust Wallet</a>' +
        '<button class="ys-btn" data-copy="' + target + '">Copy link</button></div>' +
        '<button class="ys-btn ys-quiet" data-close>Back to the game</button></div></div>');
    }
    sheet.addEventListener('click', function (e) {
      var t = e.target;
      if (t === sheet || (t.hasAttribute && t.hasAttribute('data-close'))) closeSheet();
      if (t.hasAttribute && t.hasAttribute('data-copy')) { copyText(t.getAttribute('data-copy')); t.textContent = 'Copied'; }
    });
    document.body.appendChild(sheet);
  }
  function closeSheet() { var s = document.querySelector('.ys-sheet-back'); if (s) s.remove(); }
  function copyText(text) {
    var fallback = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      } catch (e) {}
    };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback); else fallback(); } catch (e) { fallback(); }
  }

  window.BuddyHost = { version: '1.0.0', call: call, toast: toast, copyText: copyText };

  function boot() {
    var q = new URLSearchParams(location.search);
    if (q.get('signin') === 'expired') toast('That sign-in link had expired.');
    if (q.has('signin')) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
    resumePending();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
