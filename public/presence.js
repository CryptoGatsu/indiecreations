/* Indie Creations: tells the site this browser is playing a game, so the site can show "N playing now".
 * Include on a game page:  <script src="/presence.js" data-game="<game slug>" defer></script>
 * It waits until the game has loaded (window.unityInstance), then pings once a minute while the tab is in front, and
 * for 5 more minutes after the player switches to another tab (checking something, then coming back to the game).
 * The id is random and stays in this browser; nothing about the player is sent. */
(function () {
  var script = document.currentScript;
  var game = script && script.getAttribute('data-game');
  if (!game) return;
  var id;
  try {
    id = localStorage.getItem('ic_visitor');
    if (!/^[a-z0-9]{16,40}$/.test(id || '')) {
      id = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 32);
      localStorage.setItem('ic_visitor', id);
    }
  } catch (e) {
    id = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 24);
  }
  var GRACE_MS = 5 * 60 * 1000;
  var lastVisible = Date.now();
  function ping() {
    if (document.visibilityState === 'visible') lastVisible = Date.now();
    if (!window.unityInstance || Date.now() - lastVisible > GRACE_MS) return;
    try {
      fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: game, id: id }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }
  var started = false;
  var wait = setInterval(function () {
    if (!window.unityInstance || started) return;
    started = true;
    clearInterval(wait);
    ping();
    setInterval(ping, 60000);
    document.addEventListener('visibilitychange', ping);
  }, 1000);
})();
