// Light/dark override for the CouchPad site. Shared by every page so a choice
// made on the landing follows the visitor everywhere; only the landing pages
// carry the .theme-toggle button. No stored choice = follow the system setting
// (theme.css handles that via prefers-color-scheme alone).
// Loaded synchronously in <head> so the override lands before first paint.
(function () {
  var STORE = 'cg-theme';
  var root = document.documentElement;
  var choice;
  try { choice = localStorage.getItem(STORE); } catch (e) { choice = null; }
  if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);

  function isDark() {
    return root.getAttribute('data-theme')
      ? root.getAttribute('data-theme') === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // The toggle is labelled "Dark mode"; aria-pressed carries the on/off state.
  function syncPressed() {
    var btns = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', isDark() ? 'true' : 'false');
    }
  }
  document.addEventListener('DOMContentLoaded', syncPressed);

  document.addEventListener('click', function (ev) {
    if (!ev.target.closest('.theme-toggle')) return;
    var next = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(STORE, next); } catch (e) {}
    syncPressed();
  });
})();
