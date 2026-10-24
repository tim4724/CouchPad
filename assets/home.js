// Home page: holds the scan drawing (home.css, Motion) on its first frame,
// then plays it once it is well into view.
(function () {
  var art = document.querySelector('.how__art');
  if (!art) return;
  art.classList.add('is-armed');
  new IntersectionObserver(function (entries, io) {
    if (!entries[0].isIntersecting) return;
    art.classList.add('is-in');
    io.disconnect();
  }, { threshold: 0.6 }).observe(art);
})();

// The game cards' pointer light (home.css): where the pointer is, in the card.
document.querySelector('.games').addEventListener('pointermove', function (e) {
  var card = e.target.closest('.game');
  if (!card || e.pointerType !== 'mouse') return;
  var r = card.getBoundingClientRect();
  card.style.setProperty('--x', e.clientX - r.left + 'px');
  card.style.setProperty('--y', e.clientY - r.top + 'px');
});
