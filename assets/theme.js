// Light/dark override for the Paper Balloon site. Shared by every page so a choice
// made on one follows the visitor everywhere; the home, room and beta pages
// carry the .theme-toggle button. No stored choice = follow the system setting
// (theme.css handles that via prefers-color-scheme alone).
// Loaded synchronously in <head> so the override lands before first paint.
(function () {
  var STORE = 'cg-theme';
  var root = document.documentElement;
  var choice;
  try { choice = localStorage.getItem(STORE); } catch (e) { choice = null; }
  if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);

  // Pages declare one theme-color per scheme (media="(prefers-color-scheme:
  // …)") so the browser bar follows the page background; a forced scheme has
  // to win over the system one there too, or the bar keeps the other scheme's
  // color.
  var bars = [].map.call(document.querySelectorAll('meta[name="theme-color"][media]'), function (m) {
    return { el: m, color: m.content, scheme: m.media.indexOf('dark') !== -1 ? 'dark' : 'light' };
  });
  function syncBar() {
    var forced = root.getAttribute('data-theme');
    var pick = bars.filter(function (b) { return b.scheme === forced; })[0];
    bars.forEach(function (b) { b.el.content = pick ? pick.color : b.color; });
  }
  syncBar();

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
    syncBar();
  });
})();
