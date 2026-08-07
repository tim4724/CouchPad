/* §10 orientation, asked for at the earliest possible moment: loaded from <head>,
   not deferred, so this runs before the body exists and long before first paint —
   the launcher's bridge is installed before any page script, so the rotation
   happens while the "Joining…" cover is still up and the player never sees it.

   A SEPARATE FILE, not an inline <script>, on purpose: this origin ships
   `script-src 'self'` (see security-headers.conf) and so do most game origins,
   which blocks inline script outright. Same reason the contract tells games to keep
   their contract code in their own bundle.

   Opt in with ?orient=landscape; the buttons in controller-test.js cover the
   mid-session case. */
(function () {
  'use strict';

  if (new URLSearchParams(location.search).get('orient') !== 'landscape') return;

  // Recorded either way so the page can report what actually happened rather than
  // assuming the call landed — a silently skipped call here is exactly the bug this
  // file was written to fix.
  var host = window.CouchPadHost;
  if (host && host.setOrientation) {
    host.setOrientation('landscape');
    window.__cpOrientAsked = 'called';
  } else {
    window.__cpOrientAsked = 'no-bridge';
  }
})();
