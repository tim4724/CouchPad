// Language preference + German-suggestion banner for the Couchpad site.
// Shared by every page: the landing (index.html carries #langbar; /de/ does not)
// and the legal pages (/privacy, /imprint and their /en/ counterparts). The
// blocks below each no-op on pages missing the elements they target, so one
// file covers all of them.
(function () {
  var STORE = 'cg-lang';
  var choice;
  try { choice = localStorage.getItem(STORE); } catch (e) { choice = null; }

  document.addEventListener('click', function (ev) {
    // Remember the language whenever a switch/banner link is clicked, so the
    // suggestion never nags again once the visitor has expressed a preference.
    var pref = ev.target.closest('[data-lang-set]');
    if (pref) {
      try { localStorage.setItem(STORE, pref.getAttribute('data-lang-set')); } catch (e) {}
    }

    // Legal-page DE<->EN toggle: replace the current history entry so switching
    // does not accumulate in the back stack. Falls back to a normal link when
    // JavaScript is disabled. (Landing toggles are plain [data-lang-set] links
    // that navigate normally.)
    var swap = ev.target.closest('.lang-switch');
    if (swap) {
      ev.preventDefault();
      location.replace(swap.href);
    }
  });

  // Below only applies to a page carrying the banner (the EN root), and only
  // when the visitor hasn't chosen and their browser ranks German above English.
  var bar = document.getElementById('langbar');
  if (!bar || choice) return;
  var prefs = navigator.languages || [navigator.language || ''];
  var wantsDe = false;
  for (var i = 0; i < prefs.length; i++) {
    var code = prefs[i].slice(0, 2).toLowerCase();
    if (code === 'en') break;        // English ranked first → stay, no banner
    if (code === 'de') { wantsDe = true; break; }
  }
  if (!wantsDe) return;

  bar.hidden = false;
  bar.querySelector('.langbar__dismiss').addEventListener('click', function () {
    bar.hidden = true;
    try { localStorage.setItem(STORE, 'en'); } catch (e) {}
  });
})();
