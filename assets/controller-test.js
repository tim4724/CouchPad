/* Contract test controller — a stand-in game controller that exercises every
   launcher⇄game touchpoint in CouchPad Controller's CONTRACT.md, so the shell can
   be tested without a real game and a game author can see each one behave.
   Every shell call is feature-detected, so this page is also a working (inert)
   browser page — which is the contract's central rule, not a nicety. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);

  // §1: the presence of cpName is the shell gate.
  var cpName = params.get('cpName');
  var inShell = cpName !== null;
  $('mode').textContent = inShell ? 'launcher shell' : 'plain browser';
  $('mode').className = 'badge ' + (inShell ? 'shell' : 'browser');
  $('cpname').textContent = inShell ? JSON.stringify(cpName) : '— (absent)';
  $('name').textContent = inShell ? cpName : '(none)';

  function log(msg) {
    var t = new Date().toTimeString().slice(0, 8);
    $('log').textContent += t + '  ' + msg + '\n';
    $('log').scrollTop = $('log').scrollHeight;
  }
  log(inShell ? 'loaded in the launcher' : 'loaded in a browser — shell calls are no-ops');

  // ---- §2 setName: the launcher calls this on rename and on every page load.
  window.CouchPad = window.CouchPad || {};
  var setNameCalls = 0;
  window.CouchPad.setName = function (name) {
    setNameCalls++;
    $('setname').textContent = setNameCalls;
    $('name').textContent = name;
    log('setName(' + JSON.stringify(name) + ')');
  };

  // ---- §9 system back.
  var armed = false;
  var backCalls = 0;
  var backMode = 'decline';

  function setArmed(on) {
    armed = on;
    $('arm').setAttribute('aria-pressed', String(on));
    $('arm').textContent = 'Armed: ' + (on ? 'yes' : 'no');
    // Guarded — absent in a browser, so this is a no-op there.
    if (window.CouchPadHost && window.CouchPadHost.enableSystemBack) {
      window.CouchPadHost.enableSystemBack(on);
      log('enableSystemBack(' + on + ')');
    } else {
      log('enableSystemBack(' + on + ') — no bridge, ignored');
    }
  }

  // §9 requires a SYNCHRONOUS decision: a Promise counts as unconsumed.
  function installBack() {
    if (backMode === 'absent') {
      delete window.CouchPad.back;
      return;
    }
    window.CouchPad.back = function () {
      backCalls++;
      $('backs').textContent = backCalls;
      // The realistic shape: consume only when there is something to close.
      if ($('dlg').open) {
        closeDialog();
        log('back() → true (closed the dialog)');
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

  // ---- §4 theming: mutate the metas; the launcher's observer retints live.
  var THEMES = [
    ['default', '#101014', '#f2555a'],
    ['deep blue', '#0b1020', '#4d8dff'],
    ['forest', '#0d1a12', '#3ddc84'],
    ['light bar', '#f2f2f5', '#7a4dff']
  ];
  THEMES.forEach(function (t) {
    var b = document.createElement('button');
    b.textContent = t[0];
    b.onclick = function () {
      document.querySelector('meta[name="theme-color"]').content = t[1];
      document.querySelector('meta[name="cp-accent-color"]').content = t[2];
      log('theme-color=' + t[1] + ' cp-accent-color=' + t[2]);
    };
    $('themes').append(b);
  });

  // ---- §5 safe zone: both channels side by side, so a mismatch is visible.
  var EDGES = ['top', 'right', 'bottom', 'left'];
  function readZone() {
    var cs = getComputedStyle(document.documentElement);
    $('vars').textContent = EDGES.map(function (e) {
      return cs.getPropertyValue('--cp-safe-' + e).trim() || '—';
    }).join(' / ');
    var p = getComputedStyle($('envprobe'));
    $('env').textContent =
      [p.paddingTop, p.paddingRight, p.paddingBottom, p.paddingLeft].join(' / ');
  }
  readZone();
  // The vars are pushed natively with no event to hook, so poll.
  setInterval(readZone, 500);
  $('zonetoggle').onclick = function (e) {
    var on = $('zone').hidden;
    $('zone').hidden = !on;
    e.currentTarget.setAttribute('aria-pressed', String(on));
  };

  // ---- §3 session end. Terminal only — the launcher tears the web view down.
  ['game_ended', 'room_not_found', 'game_full', 'replaced', 'nonsense'].forEach(function (reason) {
    var b = document.createElement('button');
    b.textContent = reason;
    b.onclick = function () {
      log('gameEnded(' + reason + ')');
      if (window.CouchPadHost && window.CouchPadHost.gameEnded) {
        window.CouchPadHost.gameEnded(reason);
      } else {
        log('  no bridge — a browser game would navigate itself here');
      }
    };
    $('ends').append(b);
  });

  // ---- §7 lifecycle: the launcher synthesizes a persisted pagehide when the app
  // backgrounds; the engine fires the real visibilitychange on return.
  addEventListener('pagehide', function (e) {
    log('pagehide (persisted=' + e.persisted + ') — close the relay socket here');
  });
  addEventListener('visibilitychange', function () {
    log('visibilitychange → ' + document.visibilityState);
  });
})();
