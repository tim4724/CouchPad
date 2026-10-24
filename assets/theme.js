// Light/dark override for the Paper Balloon site. Shared by every page so a choice
// made on one follows the visitor everywhere; the home, room and beta pages
// carry the .theme-toggle button. No stored choice = follow the system setting
// (theme.css handles that via prefers-color-scheme alone). Also keeps the
// browser bar colour in step with the page (theme-color, overscroll).
// Loaded synchronously in <head> so the override lands before first paint.
(function () {
  var STORE = 'cg-theme';
  var root = document.documentElement;
  var choice;
  try { choice = localStorage.getItem(STORE); } catch (e) { choice = null; }
  if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);

  // iOS Safari applies :active (the buttons' press, site.css) only under a
  // touch listener.
  document.addEventListener('touchstart', function () {}, { passive: true });

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

  // Marks the lower half of the scroll (is-lower-half, site.css), so the
  // overscroll and bar colour match the nearer end of the page. While bouncing,
  // iOS reports scrollY below 0 or past the end, so a page too short to scroll
  // still switches for a bounce at its bottom. Measured again on load, once
  // images have set the page's height.
  function syncHalf() {
    root.classList.toggle('is-lower-half', scrollY > (root.scrollHeight - innerHeight) / 2);
  }
  addEventListener('scroll', syncHalf, { passive: true });
  addEventListener('resize', syncHalf);
  addEventListener('load', syncHalf);

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

  // With a mouse, the new scheme spreads from the button as a view transition
  // (site.css). Not on touch screens: there the browser's own bars recolour
  // at once while the page is still revealing, iOS Safari draws its toolbar
  // opaque for the length of a transition, and Firefox on Android stalls on
  // it. They switch at once; what appears still plays its own entrance.
  var finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.theme-toggle');
    if (!btn) return;
    // Decided when applied, not on click: a view transition applies a frame
    // or more later, and a second tap in between must flip it back.
    function apply() {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      root.classList.add('theme-switched');
      try { localStorage.setItem(STORE, next); } catch (e) {}
      syncPressed();
      syncBar();
    }
    if (!document.startViewTransition || !finePointer.matches || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply();
      return;
    }
    var r = btn.getBoundingClientRect();
    var x = r.left + r.width / 2;
    var y = r.top + r.height / 2;
    root.style.setProperty('--vt-x', x + 'px');
    root.style.setProperty('--vt-y', y + 'px');
    root.style.setProperty('--vt-r', Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 'px');
    document.startViewTransition(apply);
  });
})();
