// Language preference + German-suggestion banner for the CouchPad site.
// Shared by every page: the landing (index.html carries #langbar; /de/ does not),
// the legal pages (/privacy, /imprint and their /en/ counterparts) and the room
// page. The blocks below each no-op on pages missing the elements they target,
// so one file covers all of them.
//
// One saved choice for the whole site: picking a language on any page (landing
// link, legal toggle, room-page picker) is what the others honor next.
(function () {
  var STORE = 'cg-lang';
  var choice;
  try { choice = localStorage.getItem(STORE); } catch (e) { choice = null; }

  // The visitor's language among `supported`: the saved choice if it is one of
  // them, else the first of them in the browser's ranked list, else null.
  // Pages that have one URL per language only suggest with this; pages with a
  // single URL (the room page) render in it.
  function preferred(supported) {
    if (choice && supported.indexOf(choice) !== -1) return choice;
    var prefs = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < prefs.length; i++) {
      var code = prefs[i].slice(0, 2).toLowerCase();
      if (supported.indexOf(code) !== -1) return code;
    }
    return null;
  }
  function save(code) {
    choice = code;
    try { localStorage.setItem(STORE, code); } catch (e) {}
  }
  window.cgLang = { preferred: preferred, save: save };

  document.addEventListener('click', function (ev) {
    // Remember the language whenever a switch/banner link is clicked. A saved
    // "en" silences the German banner; a saved "de" keeps offering it.
    var pref = ev.target.closest('[data-lang-set]');
    if (pref) save(pref.getAttribute('data-lang-set'));

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

  // Below only applies to a page carrying the banner (the EN root). Show it
  // when German wins: a saved "de", or nothing saved (or a language this page
  // lacks) and the browser ranks German above English. Never redirect: every
  // URL keeps its language.
  var bar = document.getElementById('langbar');
  if (!bar || preferred(['en', 'de']) !== 'de') return;

  bar.hidden = false;
  bar.querySelector('.langbar__dismiss').addEventListener('click', function () {
    bar.hidden = true;
    save('en');
  });
})();
