/* Contract test controller — a stand-in game controller that exercises every
   launcher⇄game touchpoint in Paper Balloon Controller's CONTRACT.md, so the shell can
   be tested without a real game and a game author can see each one behave.
   Every shell call is feature-detected, so this page is also a working (inert)
   browser page — which is the contract's central rule, not a nicety. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  // The shell gate: only the launcher defines it, before any page script runs.
  var host = window.PaperBalloonHost;

  $('mode').textContent = host ? 'launcher shell' : 'plain browser';
  $('mode').className = 'badge ' + (host ? 'shell' : 'browser');
  $('bridge').textContent = host ? Object.keys(host).join(', ') : '— (absent)';

  function log(msg) {
    var t = new Date().toTimeString().slice(0, 8);
    $('log').textContent += t + '  ' + msg + '\n';
    $('log').scrollTop = $('log').scrollHeight;
  }
  log(host ? 'loaded in the launcher' : 'loaded in a browser — shell calls are no-ops');

  // Calls host[method](args) when the bridge has it, logging either way.
  function call(method, args) {
    // String(), not JSON, for numbers: JSON.stringify(NaN) is "null".
    var shown = method + '(' + args.map(function (a) {
      return typeof a === 'number' ? String(a) : JSON.stringify(a);
    }).join(', ') + ')';
    if (host && typeof host[method] === 'function') {
      log(shown);
      return host[method].apply(host, args);
    }
    log(shown + ' — no bridge, ignored');
  }

  // ---- §1 name: always current, so read it rather than caching it.
  function readName() {
    $('name').textContent = host && 'name' in host ? JSON.stringify(host.name) : '— (absent)';
  }
  readName();

  // ---- §2 editName: each call gets its own sheet and its own answer, so ×2 must
  // show two sheets one after the other and log two results.
  function rename(tag) {
    var asked = call('editName', []);
    if (!asked) return;   // a browser game opens its own name field here
    asked.then(function (name) {
      log(tag + 'editName → ' + JSON.stringify(name));
      readName();
    });
  }
  $('rename').onclick = function () { rename(''); };
  $('rename2').onclick = function () { rename('#1 '); rename('#2 '); };

  // ---- §3 leaving. The close is ours to draw; in a browser there is nothing to
  // leave, so it stays hidden.
  if (host && host.leave) $('leave').hidden = false;
  $('leave').onclick = function () { call('leave', []); };

  ['game_ended', 'room_not_found', 'game_full', 'replaced', 'nonsense'].forEach(function (reason) {
    var b = document.createElement('button');
    b.textContent = reason;
    b.onclick = function () { call('gameEnded', [reason]); };
    $('ends').append(b);
  });
  // leave wins → home with no message; gameEnded wins → "Room is full".
  $('leavefirst').onclick = function () { call('leave', []); call('gameEnded', ['game_full']); };
  $('endfirst').onclick = function () { call('gameEnded', ['game_full']); call('leave', []); };

  // ---- §4 theming: rewrite the metas and :root's accent-color (via the CSS class)
  // together. The launcher watches color-scheme live and reads the rest only when
  // editName() opens its sheet.
  var THEMES = [
    // [label, class, color-scheme, theme-colors as [content, media?], status icons]
    ['dark', 't-dark', 'dark', [['#101014']], 'light'],
    ['forest', 't-forest', 'dark', [['#0d1a12']], 'light'],
    ['light', 't-light', 'light', [['#f2f2f5']], 'dark'],
    ['system', 't-system', 'light dark',
      [['#f2f2f5', '(prefers-color-scheme: light)'], ['#101014', '(prefers-color-scheme: dark)']],
      'follow the system'],
    // No metas, no accent: dark icons, and the sheet in the launcher's own palette.
    ['bare', 't-bare', null, [], 'dark']
  ];
  function applyTheme(t, button) {
    Array.prototype.forEach.call(
      document.querySelectorAll('meta[name="color-scheme"], meta[name="theme-color"]'),
      function (m) { m.remove(); });
    if (t[2]) addMeta('color-scheme', t[2]);
    t[3].forEach(function (c) { addMeta('theme-color', c[0], c[1]); });
    document.documentElement.className = t[1];
    Array.prototype.forEach.call(document.querySelectorAll('#themes button'), function (o) {
      o.setAttribute('aria-pressed', String(o === button));
    });
    $('icons').textContent = t[4];
    log('theme ' + t[0] + ': color-scheme=' + (t[2] ? JSON.stringify(t[2]) : '(none)') +
      ' accent-color=' + getComputedStyle(document.documentElement).accentColor);
  }
  function addMeta(name, content, media) {
    var m = document.createElement('meta');
    m.name = name;
    m.content = content;
    if (media) m.media = media;
    document.head.append(m);
  }
  THEMES.forEach(function (t, i) {
    var b = document.createElement('button');
    b.textContent = t[0];
    b.setAttribute('aria-pressed', String(i === 0));
    b.onclick = function () { applyTheme(t, b); };
    $('themes').append(b);
  });
  $('icons').textContent = THEMES[0][4];

  // ---- §5 safe area, read live: rotation (§10) and arming back (§9) change it,
  // and nothing fires for the latter, so poll. The name rides along (§1).
  function readZone() {
    var p = getComputedStyle($('envprobe'));
    $('env').textContent =
      [p.paddingTop, p.paddingRight, p.paddingBottom, p.paddingLeft].join(' / ');
    readName();
  }
  readZone();
  setInterval(readZone, 500);
  $('zonetoggle').onclick = function (e) {
    var on = $('zone').hidden;
    $('zone').hidden = !on;
    e.currentTarget.setAttribute('aria-pressed', String(on));
  };

  // ---- §9 system back.
  var armed = false;
  var backCalls = 0;
  var backMode = 'decline';

  function setArmed(on) {
    armed = on;
    $('arm').setAttribute('aria-pressed', String(on));
    $('arm').textContent = 'Armed: ' + (on ? 'yes' : 'no');
    call('enableSystemBack', [on]);
  }

  window.PaperBalloon = window.PaperBalloon || {};
  // §9 requires a SYNCHRONOUS decision: a Promise counts as unconsumed.
  function installBack() {
    if (backMode === 'absent') {
      delete window.PaperBalloon.back;
      return;
    }
    window.PaperBalloon.back = function () {
      backCalls++;
      $('backs').textContent = backCalls;
      // The realistic shape: consume only when there is something to close.
      if ($('dlg').open) {
        log('back() → true (closing the dialog)');
        closeDialog();
        return true;
      }
      var consume = backMode === 'consume';
      log('back() → ' + consume + ' (nothing open)');
      return consume;
    };
  }
  installBack();

  function closeDialog() {
    $('dlg').close();
    setArmed(false);   // §9: disarm the moment the reason for arming is gone.
  }

  $('arm').onclick = function () { setArmed(!armed); };
  $('open').onclick = function () { $('dlg').showModal(); setArmed(true); };
  $('close').onclick = closeDialog;
  // Esc in a browser, and <dialog>'s own close-request path.
  $('dlg').addEventListener('cancel', function (e) { e.preventDefault(); closeDialog(); });

  Array.prototype.forEach.call(document.querySelectorAll('[data-back]'), function (b) {
    b.onclick = function () {
      backMode = b.dataset.back;
      Array.prototype.forEach.call(document.querySelectorAll('[data-back]'), function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      installBack();
      log('back() mode: ' + backMode);
    };
  });

  // ---- §10 orientation: ask the launcher to rotate. Default portrait, reset on
  // every page load, and only the literal 'landscape' rotates — hence the nonsense
  // button, which must land back in portrait rather than doing nothing.
  function readOrientation() {
    $('orient').textContent =
      matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
  }
  readOrientation();
  // A rotation is a resize of the same document — the page is never reloaded, so
  // there is no load-time hook to read this from.
  addEventListener('resize', readOrientation);
  // ?orient=landscape asked for it from <head>, before this file ran (see
  // controller-orient.js) — reflect that in the buttons so they don't claim portrait.
  // Report what that script ACTUALLY did, not what the URL asked for: a head script
  // that never ran (CSP blocking an inline one) or found no bridge would otherwise
  // leave the buttons claiming landscape over a portrait screen with nothing to
  // explain it — which is exactly how this page once lied.
  if (params.get('orient') === 'landscape') {
    var asked = window.__cpOrientAsked;
    log(asked === 'called'
      ? 'setOrientation("landscape") from <head> — before first paint'
      : asked === 'no-bridge'
        ? 'head script ran, but no bridge — plain browser, nothing to ask'
        : 'head script never ran (blocked?) — no orientation was requested');
    document.querySelector('[data-orient="portrait"]').setAttribute('aria-pressed', 'false');
    document.querySelector('[data-orient="landscape"]')
      .setAttribute('aria-pressed', String(asked === 'called'));
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-orient]'), function (b) {
    b.onclick = function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-orient]'), function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
      call('setOrientation', [b.dataset.orient]);
    };
  });

  // ---- §11 navigator.vibrate: the three portable shapes. Absent in mobile Safari,
  // so the guard is the same one a game needs.
  function vibrate(pattern, quiet) {
    if (!navigator.vibrate) { if (!quiet) log('vibrate — unsupported here'); return; }
    navigator.vibrate(pattern);
    if (!quiet) log('vibrate(' + JSON.stringify(pattern) + ')');
  }
  $('vtap').onclick = function () { vibrate(20); };
  $('vrhythm').onclick = function () { vibrate([10, 50, 10]); };
  // Held buzz: a 150 ms pulse re-issued every 100 ms, so it never runs out, and
  // vibrate(0) on release.
  var holdTimer = null;
  function holdStop() {
    if (holdTimer === null) return;
    clearInterval(holdTimer);
    holdTimer = null;
    vibrate(0);
  }
  $('vhold').addEventListener('pointerdown', function (e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    holdStop();
    vibrate(150);
    holdTimer = setInterval(function () { vibrate(150, true); }, 100);
  });
  $('vhold').addEventListener('pointerup', holdStop);
  $('vhold').addEventListener('pointercancel', holdStop);
  $('vhold').addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---- §12 haptic(primitive, scale).
  function scale() { return Number($('scale').value); }
  $('scale').oninput = function () { $('scaleout').textContent = scale().toFixed(2); };
  ['click', 'tick', 'low_tick', 'thud', 'spin', 'quick_rise', 'slow_rise', 'quick_fall']
    .forEach(function (p) {
      var b = document.createElement('button');
      b.textContent = p;
      b.onclick = function () { call('haptic', [p, scale()]); };
      $('prims').append(b);
    });
  $('hbogus').onclick = function () { call('haptic', ['bogus', scale()]); };
  $('hnan').onclick = function () { call('haptic', ['click', NaN]); };

  // ---- §12 hapticComposition(steps): a held rumble (25 low ticks 60 ms apart,
  // ~1.8 s, re-issued every 1.5 s, stopped with an empty sequence on release), a
  // timed knock, and a malformed middle step that must cut the sequence to one click.
  function step(primitive, delay) { return { primitive: primitive, scale: scale(), delay: delay }; }
  var rumbleTimer = null;
  function rumble() {
    var steps = [];
    for (var i = 0; i < 25; i++) steps.push(step('low_tick', i ? 60 : 0));
    call('hapticComposition', [steps]);
  }
  function rumbleStop() {
    if (rumbleTimer === null) return;
    clearInterval(rumbleTimer);
    rumbleTimer = null;
    call('hapticComposition', [[]]);
  }
  $('chold').addEventListener('pointerdown', function (e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    rumbleStop();
    rumble();
    rumbleTimer = setInterval(rumble, 1500);
  });
  $('chold').addEventListener('pointerup', rumbleStop);
  $('chold').addEventListener('pointercancel', rumbleStop);
  $('chold').addEventListener('contextmenu', function (e) { e.preventDefault(); });
  $('cknock').onclick = function () {
    call('hapticComposition', [[step('click', 0), step('thud', 100), step('click', 300)]]);
  };
  $('cprefix').onclick = function () {
    call('hapticComposition', [[step('click', 0), step('bogus', 100), step('click', 100)]]);
  };
  // Three shaped primitives with no rest between them: on iOS each is a parameter
  // curve, and curves of the same parameter follow each other back to back here.
  $('cspins').onclick = function () {
    call('hapticComposition', [[step('spin', 0), step('spin', 0), step('spin', 0)]]);
  };
  // The two caps, each tripped on its own: 33 steps well inside 5 s, so only the step
  // cap cuts the thud; one delay past 5 s, so only the run-time cap cuts it.
  $('csteps').onclick = function () {
    var steps = [];
    for (var i = 0; i < 32; i++) steps.push(step('tick', i ? 100 : 0));
    steps.push(step('thud', 100));
    call('hapticComposition', [steps]);
  };
  $('crun').onclick = function () {
    call('hapticComposition', [[step('click', 0), step('thud', 6000)]]);
  };
  // No valid step, and no sequence at all: neither is the empty sequence's stop, so
  // a rumble held with another finger must keep going.
  $('cbogus').onclick = function () { call('hapticComposition', [[step('bogus', 0)]]); };
  $('carray').onclick = function () { call('hapticComposition', ['nope']); };

  // ---- Tilt: iOS gates the sensors behind requestPermission(), which must come
  // from a tap; the launcher grants it for allow-listed origins without a dialog.
  var tilting = false;
  function fmt(values, digits) {
    return values.map(function (v) {
      return v === null || v === undefined ? '—' : v.toFixed(digits);
    }).join(' / ');
  }
  function listenTilt() {
    if (tilting) return;
    tilting = true;
    addEventListener('deviceorientation', function (e) {
      $('tiltor').textContent = 'α β γ ' + fmt([e.alpha, e.beta, e.gamma], 0);
    });
    addEventListener('devicemotion', function (e) {
      var g = e.accelerationIncludingGravity || {};
      $('tiltmo').textContent = 'x y z ' + fmt([g.x, g.y, g.z], 1);
    });
    log('listening for deviceorientation + devicemotion');
  }
  $('tilt').onclick = function () {
    var D = window.DeviceOrientationEvent;
    if (!D || typeof D.requestPermission !== 'function') {
      log('no requestPermission — no gate');
      listenTilt();
      return;
    }
    D.requestPermission().then(function (state) {
      log('requestPermission → ' + state);
      if (state === 'granted') listenTilt();
    }, function (err) {
      log('requestPermission failed: ' + err);
    });
  };

  // ---- Keyboard: a keyboard that reaches the page shrinks the visual viewport.
  function readViewport() {
    $('ih').textContent = innerHeight + 'px';
    $('vvh').textContent = window.visualViewport
      ? Math.round(visualViewport.height) + 'px'
      : '— (unsupported)';
  }
  readViewport();
  addEventListener('resize', readViewport);
  if (window.visualViewport) {
    var lastVvh = Math.round(visualViewport.height);
    visualViewport.addEventListener('resize', function () {
      readViewport();
      var h = Math.round(visualViewport.height);
      if (h !== lastVvh) log('visualViewport ' + lastVvh + ' → ' + h + 'px');
      lastVvh = h;
    });
  }

  // ---- §7 lifecycle: the launcher synthesizes a persisted pagehide when the app
  // backgrounds; the engine fires the real visibilitychange on return.
  addEventListener('pagehide', function (e) {
    holdStop();
    rumbleStop();
    log('pagehide (persisted=' + e.persisted + ') — close the relay socket here');
  });
  addEventListener('visibilitychange', function () {
    log('visibilitychange → ' + document.visibilityState);
  });
})();
