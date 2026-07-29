// Room join page. The URL is couchpad.games/<CODE>#<instance> — the same link
// a display's QR encodes for app deep-linking (see .well-known/). When the app
// isn't installed the browser lands here instead: we look the code up on the
// relay directory, show what we know about the room, and offer browser play
// plus the app stores.
//
// Game identity (names, art, host allow-list, per-game relays) comes from
// /games-manifest.json — the web-served counterpart of the controller apps'
// bundled manifest, so a new game is a site deploy, not a code change here.
//
// Resolution mirrors the controller apps (RoomDirectory in
// Couch-Games-Controller): probe the game relays and the shared relay in
// parallel and prefer a host-declared controller URL over the declared origin.
// Relay answers are UNTRUSTED — a join target that doesn't vet against the
// manifest allow-list is treated as "room not found": we won't send anyone to
// a game we can't identify.
(function () {
  'use strict';

  // ---- Store listings (fill in when the apps go live; sizes shown to users) ----
  var IOS_APP_URL = null;      // e.g. 'https://apps.apple.com/app/couch-games/id<APPSTORE_ID>'
  var IOS_APP_SIZE = '≈ 3 MB';
  var ANDROID_APP_URL = null;  // 'https://play.google.com/store/apps/details?id=com.couchgames.controller'
  var ANDROID_APP_SIZE = '≈ 8 MB';

  // Both are probed while the couch-games.com -> couchpad.games move is in
  // flight: ws.couchpad.games is canonical, ws.couch-games.com still answers
  // until Tiny Track and Powder are repointed. Drop the old entry once they are
  // (and the matching connect-src in security-headers.conf).
  var SHARED_RELAYS = ['https://ws.couchpad.games', 'https://ws.couch-games.com'];
  // Allow-list for room links. Preview deployments live on subdomains, so both
  // apexes stay listed until the per-game namespaces move to *.couchpad.games.
  var OWN_HOSTS = ['couchpad.games', 'couch-games.com'];

  // ---- DOM ----
  var el = {
    card: document.getElementById('roomcard'),
    art: document.getElementById('room-art'),
    mark: document.getElementById('room-mark'),
    status: document.getElementById('room-status'),
    code: document.getElementById('room-code'),
    meta: document.getElementById('room-meta'),
    game: document.getElementById('room-game'),
    browser: document.getElementById('join-browser'),
    ios: document.getElementById('app-ios'),
    iosSub: document.getElementById('app-ios-sub'),
    android: document.getElementById('app-android'),
    androidSub: document.getElementById('app-android-sub')
  };

  function setStatus(text, mod) {
    el.status.textContent = text;
    el.status.className = 'badge' + (mod ? ' badge--' + mod : '');
  }

  function setupStoreButton(a, sub, url, store, size) {
    if (url) {
      a.href = url;
      sub.textContent = store + ' · ' + size;
    } else {
      a.removeAttribute('href');
      a.setAttribute('aria-disabled', 'true');
      sub.textContent = 'Coming soon · ' + size;
    }
  }
  setupStoreButton(el.ios, el.iosSub, IOS_APP_URL, 'App Store', IOS_APP_SIZE);
  setupStoreButton(el.android, el.androidSub, ANDROID_APP_URL, 'Google Play', ANDROID_APP_SIZE);

  // ---- Parse the link ----
  var m = location.pathname.match(/^\/([1-9A-HJ-NP-Za-km-z]{6})$/);
  if (!m) {
    setStatus('Invalid link', 'err');
    metaMessage('No room code in this link — scan the QR on your TV.');
    return;
  }
  var code = m[1];
  var instance = (location.hash.slice(1).match(/^[A-Za-z0-9_-]{1,64}$/) || [''])[0];
  el.code.textContent = code;
  document.title = 'Room ' + code + ' · Couch Games';

  // ---- Relay lookup ----
  function lookup(base) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ctrl) setTimeout(function () { ctrl.abort(); }, 5000);
    return fetch(base + '/room/' + encodeURIComponent(code), ctrl ? { signal: ctrl.signal } : {})
      .then(function (res) {
        if (!res.ok) return null;
        return res.json().then(function (json) {
          return {
            url: typeof json.url === 'string' ? json.url : null,
            origin: typeof json.origin === 'string' ? json.origin : null
          };
        });
      })
      .catch(function () { return null; });
  }

  function hostMatches(host, allowed) {
    return host === allowed || host.slice(-(allowed.length + 1)) === '.' + allowed;
  }

  function metaMessage(text) {
    el.meta.textContent = text;
    el.meta.hidden = false;
  }

  // One headline, no badge — the viewfinder-with-question-mark carries the
  // rest. (People land here from a QR/link, so a stale link is the usual
  // cause; the looked-up code stays visible below.)
  function notFound() {
    el.status.hidden = true;
    // SVG elements lack the HTMLElement `hidden` property — toggle the attribute.
    el.mark.removeAttribute('hidden');
    el.game.textContent = 'Room not found';
    el.game.hidden = false;
  }

  fetch('/games-manifest.json')
    .then(function (res) { return res.ok ? res.json() : null; })
    .catch(function () { return null; })
    .then(function (manifest) {
      var games = (manifest && manifest.games || []).filter(function (g) {
        return g && typeof g.name === 'string';
      });
      var allowedHosts = OWN_HOSTS.slice();
      var relays = [];
      for (var i = 0; i < games.length; i++) {
        var hosts = games[i].hosts || [];
        for (var j = 0; j < hosts.length; j++) allowedHosts.push(hosts[j].toLowerCase());
        var probe = games[i].relayProbeBase;
        if (probe && relays.indexOf(probe) === -1) relays.push(probe);
      }
      for (var k = 0; k < SHARED_RELAYS.length; k++) {
        if (relays.indexOf(SHARED_RELAYS[k]) === -1) relays.push(SHARED_RELAYS[k]);
      }

      // Returns the join URL when target is an allowed https URL, else null.
      function vetted(target) {
        var u;
        try { u = new URL(target); } catch (e) { return null; }
        if (u.protocol !== 'https:') return null;
        var host = u.hostname.toLowerCase();
        if (!allowedHosts.some(function (a) { return hostMatches(host, a); })) return null;
        if (instance && !u.hash) u.hash = instance;
        // Single-instance relays substitute {instance} with "" leaving a bare "#".
        return u.hash ? u.href : u.href.replace(/#$/, '');
      }

      function gameFor(joinUrl) {
        var host = new URL(joinUrl).hostname.toLowerCase();
        for (var i = 0; i < games.length; i++) {
          if ((games[i].hosts || []).some(function (h) { return hostMatches(host, h.toLowerCase()); })) {
            return games[i];
          }
        }
        return null;
      }

      function render(joinUrl) {
        var game = gameFor(joinUrl);
        if (game && game.art) {
          el.art.src = game.art;
          el.art.hidden = false;
          el.card.classList.add('roomcard--art');
        }
        if (game) {
          el.game.textContent = game.name;
          el.game.hidden = false;
        }
        el.status.hidden = true; // the banner speaks for itself once live
        el.browser.href = joinUrl;
        el.browser.hidden = false;
      }

      Promise.all(relays.map(lookup)).then(function (results) {
        var founds = results.filter(Boolean);
        for (var i = 0; i < founds.length; i++) {
          if (founds[i].url) {
            var joinUrl = vetted(founds[i].url);
            if (joinUrl) return render(joinUrl);
          }
        }
        for (var j = 0; j < founds.length; j++) {
          if (founds[j].origin) {
            var originUrl = vetted(founds[j].origin.replace(/\/+$/, '') + '/' + code);
            if (originUrl) return render(originUrl);
          }
        }
        // Unknown, unreachable, or unvetted — we can't tell which game this
        // is, so there is nothing safe to join. One honest answer.
        notFound();
      });
    });
})();
