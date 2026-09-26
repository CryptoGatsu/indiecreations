// My Favorite Sheep - the host page's services for the Unity build (window.MFS), called from Plugins/WebGL/MfsPage.jslib.
//
//   MFS.call(id, method, argsJson)   account + shop calls; answers go to Unity via SendMessage('MfsWebBridge', 'OnReply')
//     me        -> { address, wallet, walletBrowser, touch }   who is signed in on this browser (site cookie ic_player)
//     signin    -> { address }        connect the browser's wallet and sign the free sign-in message
//     signout   -> {}
//     catalog   -> the in-game shop: items, live price, what this wallet owns (/api/game/catalog)
//     buy       -> { state, itemId, tx }   quote -> ERC-20 transfer of $CREATIONS to the treasury -> on-chain confirmation
//     walletApp -> shows how to continue in a wallet app (phones without a wallet in the browser)
//   MFS.copyText / openUrl / fullscreen / onUnityReady
//
// Keys never touch Unity or this page: signing and paying happen in the player's own wallet. The site decides what is
// owned (it watches the chain), and signs the list the game reads.
(function () {
  'use strict';

  var CHAIN = { id: 4663, hex: '0x1237', name: 'Robinhood Chain', rpc: 'https://rpc.mainnet.chain.robinhood.com', explorer: 'https://robinhoodchain.blockscout.com' };
  var GAME = 'My Favorite Sheep';
  var PAGE_PATH = '/my-favorite-sheep';
  var PENDING_KEY = 'mfs.pendingPayments';

  // ---------------------------------------------------------------- environment
  var coarse = false;
  try { coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; } catch (e) {}

  // EIP-6963: wallets announce themselves; window.ethereum is the fallback (and what in-app wallet browsers inject)
  var announced = [];
  window.addEventListener('eip6963:announceProvider', function (e) {
    if (e && e.detail && e.detail.provider) announced.push(e.detail);
  });
  try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch (e) {}

  function provider() {
    if (window.ethereum && typeof window.ethereum.request === 'function') return window.ethereum;
    return announced.length ? announced[0].provider : null;
  }
  function walletBrowser() { return !!(window.ethereum && coarse); }

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
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function short(a) { return a ? a.slice(0, 6) + '...' + a.slice(-4) : ''; }
  function wait(ms) { return sleep(ms); }

  function walletError(e) {
    var code = e && (e.code || (e.data && e.data.code));
    if (code === 4001 || code === 'ACTION_REJECTED') return 'You cancelled in your wallet.';
    if (code === -32002) return 'Your wallet already has a request open - check it.';
    var msg = (e && (e.shortMessage || e.message)) || String(e);
    if (/insufficient funds/i.test(msg)) return 'Not enough ETH on Robinhood Chain for the network fee.';
    if (/transfer amount exceeds balance|exceeds balance/i.test(msg)) return 'Not enough $CREATIONS in this wallet.';
    return msg.length > 160 ? msg.slice(0, 157) + '...' : msg;
  }

  var unity = function () { return window.unityInstance || null; };
  function send(fn, obj) {
    var u = unity();
    if (!u) return;
    try { u.SendMessage('MfsWebBridge', fn, typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) {}
  }
  function reply(id, ok, data, error) { send('OnReply', { id: id, ok: ok, data: data === undefined ? '' : JSON.stringify(data), error: error || '' }); }
  function progress(id, text) { if (id) send('OnProgress', { id: id, text: text }); }

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

  function signIn(id) {
    var p = provider();
    if (!p) { showWalletSheet('signin'); return Promise.reject(new Error(noWalletText('sign in'))); }
    progress(id, 'Connect your wallet...');
    return accounts(p, true).then(function (address) {
      if (!address) throw new Error('Your wallet returned no account.');
      return api('/api/game/signin?address=' + encodeURIComponent(address)).then(function (n) {
        progress(id, 'Sign the message in your wallet (free, no transaction).');
        return p.request({ method: 'personal_sign', params: [utf8Hex(n.message), address] }).then(function (signature) {
          return api('/api/game/signin', { method: 'POST', body: { address: address, issuedAt: n.issuedAt, signature: signature } });
        });
      });
    }).then(function (r) { account = r.address; renderWalletView(); return { address: r.address }; });
  }

  // ---------------------------------------------------------------- payments
  function loadPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch (e) { return []; } }
  function savePending(list) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch (e) {} }
  function addPending(p) { var l = loadPending().filter(function (x) { return x.orderId !== p.orderId; }); l.push(p); savePending(l); }
  function dropPending(orderId) { savePending(loadPending().filter(function (x) { return x.orderId !== orderId; })); }

  // Asks the site until it has seen the payment on-chain (it hands the cosmetic over the moment it does).
  function confirmPayment(orderId, tx, id, minutes) {
    var until = Date.now() + (minutes || 5) * 60000;
    function attempt() {
      return api('/api/shop/confirm', { method: 'POST', body: { orderId: orderId, txHash: tx } }).then(function (r) {
        if (r.state === 'delivered') { dropPending(orderId); return 'delivered'; }
        if (Date.now() > until) return 'pending';
        return wait(3000).then(attempt);
      }, function (e) {
        if (e.status && e.status >= 400 && e.status < 500) { dropPending(orderId); throw e; }
        if (Date.now() > until) return 'pending';
        return wait(4000).then(attempt);                    // the site or the chain hiccuped: keep asking
      });
    }
    progress(id, 'Payment sent - waiting for Robinhood Chain to confirm it...');
    return attempt();
  }

  function buy(itemId, id) {
    var p = provider();
    if (!p) { showWalletSheet('buy', itemId); return Promise.reject(new Error(noWalletText('buy'))); }
    var quote;
    return api('/api/game/me').then(function (me) {
      return me.address ? me : signIn(id);
    }).then(function () {
      progress(id, 'Getting a price...');
      return api('/api/game/quote', { method: 'POST', body: { itemId: itemId } });
    }).then(function (q) {
      quote = q;
      return accounts(p, true);
    }).then(function (from) {
      if (!from || from.toLowerCase() !== quote.wallet.toLowerCase())
        throw new Error('Your wallet is on ' + short(from) + '. Switch it to ' + short(quote.wallet) + ' (the wallet you signed in with) and try again.');
      progress(id, 'Switching your wallet to Robinhood Chain...');
      return ensureChain(p).then(function () { return from; });
    }).then(function (from) {
      var amount = Number(quote.amount);
      var shown = isFinite(amount) ? Math.ceil(amount).toLocaleString('en-US') : quote.amount;
      progress(id, 'Confirm the payment in your wallet: ' + shown + ' $CREATIONS.');
      var data = '0xa9059cbb' + pad32(quote.treasury) + pad32(BigInt(quote.amountRaw).toString(16));
      return p.request({ method: 'eth_sendTransaction', params: [{ from: from, to: quote.token, data: data, value: '0x0' }] });
    }).then(function (tx) {
      addPending({ orderId: quote.orderId, tx: tx, itemId: itemId, at: Date.now() });
      return confirmPayment(quote.orderId, tx, id, 5).then(function (state) {
        return { state: state, itemId: itemId, tx: tx };
      });
    });
  }

  // A payment sent just before the page closed: finish it quietly on the next visit.
  function resumePending() {
    var list = loadPending().filter(function (x) { return Date.now() - x.at < 24 * 3600000; });
    savePending(list);
    list.forEach(function (x) {
      confirmPayment(x.orderId, x.tx, 0, 10).then(function (state) {
        if (state === 'delivered') { send('OnAccountChanged', ''); toast('Your ' + (x.itemId || 'cosmetic') + ' is unlocked.'); }
      }, function () {});
    });
  }

  // ---------------------------------------------------------------- calls from Unity
  var account = null;
  var methods = {
    me: function () {
      return api('/api/game/me').then(function (r) {
        account = r.address;
        return { address: r.address, wallet: !!provider(), walletBrowser: walletBrowser(), touch: coarse };
      });
    },
    signin: function (args, id) { return signIn(id); },
    signout: function () { return api('/api/game/me', { method: 'DELETE' }).then(function () { account = null; renderWalletView(); return {}; }); },
    catalog: function () { return api('/api/game/catalog?game=' + encodeURIComponent(GAME)); },
    buy: function (args, id) { return buy(args.itemId, id); },
    walletApp: function (args) { showWalletSheet(args && args.reason || 'signin'); return Promise.resolve({}); }
  };

  function call(id, method, argsJson) {
    var fn = methods[method];
    if (!fn) { reply(id, false, undefined, 'Unknown call ' + method); return; }
    var args = {};
    try { args = argsJson ? JSON.parse(argsJson) : {}; } catch (e) {}
    Promise.resolve().then(function () { return fn(args, id); }).then(function (data) {
      reply(id, true, data);
    }, function (e) {
      console.warn('[MFS] ' + method + ' failed', e);
      reply(id, false, undefined, e && e.status ? (e.message || 'Request failed.') : walletError(e));
    });
  }

  // ---------------------------------------------------------------- page chrome (sheets, toasts, full screen)
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  var toastTimer = 0;
  function toast(text) {
    var t = document.getElementById('mfs-toast');
    if (!t) { t = el('<div id="mfs-toast" class="toast" role="status"></div>'); document.body.appendChild(t); }
    t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 5200);
  }

  function noWalletText(what) {
    return coarse ? 'To ' + what + ', open the game in your wallet app - the steps are on screen.'
                  : 'No wallet found in this browser. Install MetaMask, Rabby or Coinbase Wallet, then reload.';
  }

  function pageUrl(extra) { return location.origin + PAGE_PATH + (extra ? '?' + extra : ''); }

  // Phones in Safari / Chrome have no wallet: signing in and paying happen in a wallet app's own browser, and a
  // sign-in link brings the player back here.
  function showWalletSheet(reason, itemId) {
    closeSheet();
    var target = pageUrl('wallet=1' + (itemId ? '&item=' + encodeURIComponent(itemId) : ''));
    var hostPath = target.replace(/^https?:\/\//, '');
    var sheet;
    if (!coarse) {
      sheet = el('<div class="sheet-back"><div class="sheet"><h2>No wallet in this browser</h2>' +
        '<p>Signing in and buying cosmetics use a browser wallet on Robinhood Chain. Install one, reload this page, and your purchases follow your wallet everywhere.</p>' +
        '<div class="sheet-buttons"><a class="btn" href="https://metamask.io/download/" target="_blank" rel="noopener">MetaMask</a>' +
        '<a class="btn" href="https://rabby.io/" target="_blank" rel="noopener">Rabby</a>' +
        '<a class="btn" href="https://www.coinbase.com/wallet/downloads" target="_blank" rel="noopener">Coinbase Wallet</a></div>' +
        '<button class="btn btn-quiet" data-close>Not now</button></div></div>');
    } else {
      sheet = el('<div class="sheet-back"><div class="sheet"><h2>' + (reason === 'buy' ? 'Buy in your wallet app' : 'Sign in with your wallet app') + '</h2>' +
        '<ol><li>Open this page in your wallet app\'s browser.</li>' +
        '<li>' + (reason === 'buy' ? 'Sign in and buy there - it takes a minute.' : 'Sign in there (free, no transaction).') + '</li>' +
        '<li>Tap <b>Play in Safari / Chrome</b> to come back here signed in.</li></ol>' +
        '<div class="sheet-buttons">' +
        '<a class="btn" href="https://metamask.app.link/dapp/' + hostPath + '">MetaMask</a>' +
        '<a class="btn" href="https://go.cb-w.com/dapp?cb_url=' + encodeURIComponent(target) + '">Coinbase Wallet</a>' +
        '<a class="btn" href="https://link.trustwallet.com/open_url?coin_id=60&url=' + encodeURIComponent(target) + '">Trust Wallet</a>' +
        '<button class="btn" data-copy="' + target + '">Copy link</button></div>' +
        '<small>Another wallet? Copy the link and open it in the wallet\'s own browser.</small>' +
        '<button class="btn btn-quiet" data-close>Back to the game</button></div></div>');
    }
    sheet.addEventListener('click', function (e) {
      var t = e.target;
      if (t === sheet || (t.hasAttribute && t.hasAttribute('data-close'))) closeSheet();
      if (t.hasAttribute && t.hasAttribute('data-copy')) { copyText(t.getAttribute('data-copy')); t.textContent = 'Copied'; }
    });
    document.body.appendChild(sheet);
  }
  function closeSheet() { var s = document.querySelector('.sheet-back'); if (s) s.remove(); }

  // In a wallet app's browser held upright (most can't turn sideways): a simple page to sign in, buy cosmetics and
  // carry the sign-in to Safari / Chrome. Turn the phone and the game itself takes over.
  var walletView = null, catalogCache = null;
  function renderWalletView() {
    if (!walletView) return;
    var body = walletView.querySelector('.wv-body');
    var html = '';
    if (!account) {
      html += '<p>Sign in with this wallet so the cosmetics you own come with you. It\'s a free signature - no transaction.</p>' +
              '<button class="btn btn-gold" data-act="signin">Sign in</button>';
    } else {
      html += '<p class="wv-who">Signed in as <b>' + short(account) + '</b> <button class="link" data-act="signout">sign out</button></p>' +
              '<div class="wv-go"><button class="btn btn-gold" data-act="handoff">Play in Safari / Chrome</button>' +
              '<small>Opens the game in your phone\'s browser, signed in as this wallet, where it plays in landscape.</small></div>' +
              '<div id="wv-link"></div><h3>Shop</h3><div class="wv-items">Loading the shop...</div>';
    }
    html += '<p class="wv-status" id="wv-status"></p>';
    body.innerHTML = html;
    if (account) loadWalletShop();
  }

  function loadWalletShop() {
    var box = walletView && walletView.querySelector('.wv-items');
    if (!box) return;
    methods.catalog().then(function (c) {
      catalogCache = c;
      if (!c.status || !c.status.open) { box.textContent = (c.status && c.status.reason) || 'The shop is closed right now.'; return; }
      box.innerHTML = c.items.map(function (i) {
        var price = i.tokens ? i.tokens.toLocaleString('en-US') + ' $CREATIONS' : '$' + i.usd.toFixed(2);
        return '<div class="wv-item"><img src="/shop/' + i.id + '.png" alt="" loading="lazy"><div><b>' + i.name + '</b><small>' + price +
               ' &middot; $' + i.usd.toFixed(2) + '</small></div>' +
               (i.owned ? '<span class="owned">Owned</span>' : i.available ? '<button class="btn" data-buy="' + i.id + '">Buy</button>' : '<span class="soon">Soon</span>') + '</div>';
      }).join('');
    }, function (e) { box.textContent = walletError(e); });
  }

  function wvStatus(text) { var s = document.getElementById('wv-status'); if (s) s.textContent = text || ''; }

  function openWalletView() {
    walletView = document.getElementById('wallet-view');
    if (!walletView) return;
    walletView.hidden = false;
    document.body.classList.add('wallet-browser');
    walletView.addEventListener('click', function (e) {
      var t = e.target;
      var act = t.getAttribute && t.getAttribute('data-act');
      var item = t.getAttribute && t.getAttribute('data-buy');
      if (act === 'signin') { wvStatus('Check your wallet...'); signIn(0).then(function () { wvStatus(''); }, function (e) { wvStatus(walletError(e)); }); }
      if (act === 'signout') methods.signout();
      if (act === 'handoff') makeHandoff();
      if (act === 'copy') { copyText(t.getAttribute('data-url')); t.textContent = 'Copied - paste it into Safari or Chrome'; }
      if (item) {
        t.disabled = true;
        wvStatus('Starting checkout...');
        var fakeId = 0;
        var restore = progress; progress = function (id, text) { wvStatus(text); };
        buy(item, fakeId).then(function (r) {
          progress = restore;
          wvStatus(r.state === 'delivered' ? 'Done - it\'s yours. Tap "Play in Safari / Chrome" to wear it.' : 'Payment sent - it unlocks as soon as it confirms.');
          loadWalletShop();
        }, function (e) { progress = restore; t.disabled = false; wvStatus(e && e.status ? e.message : walletError(e)); });
      }
    });
    methods.me().then(renderWalletView, renderWalletView);
  }

  function makeHandoff() {
    var box = document.getElementById('wv-link');
    wvStatus('Making your link...');
    api('/api/game/handoff', { method: 'POST', body: { to: PAGE_PATH } }).then(function (r) {
      wvStatus('');
      var url = r.url, ios = /iPhone|iPad|iPod/i.test(navigator.userAgent), android = /Android/i.test(navigator.userAgent);
      var open = ios ? '<a class="btn btn-gold" href="x-safari-' + url + '">Open in Safari</a>'
               : android ? '<a class="btn btn-gold" href="intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end">Open in Chrome</a>'
               : '';
      box.innerHTML = open + '<button class="btn" data-act="copy" data-url="' + url + '">Copy link</button>' +
        '<small>The link signs you in once, within 5 minutes. If the button does nothing, copy it and paste it into Safari or Chrome.</small>';
    }, function (e) { wvStatus(e.message || walletError(e)); });
  }

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

  function openUrl(url) { if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer'); }

  function fullscreen(on) {
    var d = document, root = d.documentElement;
    try {
      if (on && !(d.fullscreenElement || d.webkitFullscreenElement)) {
        var req = root.requestFullscreen || root.webkitRequestFullscreen;
        if (req) {
          var r = req.call(root, { navigationUI: 'hide' });
          if (r && r.then) r.then(lockLandscape, function () {});
          else lockLandscape();
        }
      } else if (!on && (d.fullscreenElement || d.webkitFullscreenElement)) {
        (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      }
    } catch (e) {}
  }
  function lockLandscape() { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {} }

  // Phones: the first tap on the game goes full screen and locks landscape (browsers only allow it inside a tap).
  function autoFullscreen() {
    if (!coarse) return;
    var once = function () {
      if (document.body.classList.contains('wallet-browser')) return;
      fullscreen(true);
      window.removeEventListener('touchend', once, true);
    };
    window.addEventListener('touchend', once, true);
  }

  // Browsers pause background tabs, which freezes a host: say so when the player comes back.
  var hiddenAt = 0, lastHidden = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (!hiddenAt) return;
    lastHidden = (Date.now() - hiddenAt) / 1000; hiddenAt = 0;
    if (lastHidden > 8 && window.unityInstance) toast('The game pauses while this tab is in the background - keep it in front while you play online.');
  });

  function onUnityReady() { document.dispatchEvent(new CustomEvent('mfs:unity-ready')); }

  window.MFS = {
    version: '1.0.0',
    call: call,
    copyText: copyText,
    openUrl: openUrl,
    fullscreen: fullscreen,
    onUnityReady: onUnityReady,
    hiddenSeconds: function () { return lastHidden; },
    isTouch: coarse,
    toast: toast,
    walletView: openWalletView   // the wallet-app view (opens by itself in a wallet's browser held upright)
  };

  function boot() {
    var q = new URLSearchParams(location.search);
    if (q.get('signin') === 'expired') toast('That sign-in link had expired - make a new one in your wallet app.');
    if (walletBrowser() && (q.get('wallet') === '1' || window.innerHeight > window.innerWidth)) openWalletView();
    // drop one-shot parameters from the address bar (clean URL)
    if (q.has('signin') || q.has('wallet') || q.has('item')) {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    }
    autoFullscreen();
    resumePending();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
