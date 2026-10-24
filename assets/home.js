// Home page: holds the scan drawing (home.css, Motion) on its first frame,
// then plays it once it is well into view.
(function () {
  var art = document.querySelector('.how__art');
  if (!art || !('IntersectionObserver' in window)) return;
  art.classList.add('is-armed');
  new IntersectionObserver(function (entries, io) {
    if (!entries[0].isIntersecting) return;
    art.classList.add('is-in');
    io.disconnect();
  }, { threshold: 0.6 }).observe(art);
})();
