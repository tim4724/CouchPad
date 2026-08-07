# couchpad.games

Static landing site for **CouchPad** — the umbrella brand for party games
where everyone plays together on the TV/screen and phones are the controllers
(scan a QR to play, no install required).

Flagship game: **HexStacker Party** (live at [hexstacker.com](https://hexstacker.com),
coming to Apple TV & Android TV). Also in development: **Tiny Track** (kart
racer) and **Powder** (skiing).

## Design

Neutral **MONO graphite chrome**, mirroring the CouchPad Controller launcher
(console-shell pattern — the game posters carry the color, the chrome stays
neutral). Stock system type, Material 3 surface values, follows the system
light/dark setting. Tokens live in `assets/theme.css`.

## Structure

- `index.html`, `de/index.html` — landing page (EN / DE)
- `room.html` + `assets/room.js` — room join page, served at `/<CODE>#<instance>`
  (nginx maps any 6-char base58 path to it); browser fallback for the app deep
  links in `.well-known/`
- `games-manifest.json` — drives the room page and is fetched by the controller
  apps. Keep in sync with the controller repo's bundled copy. `art` is the 16:9
  cover, `icon` the square brand mark (nearby-room / rejoin cards in the
  launcher). The apps match their bundled copy by **filename**, and cache
  anything they didn't ship by URL without revalidating — so re-rendered artwork
  ships under a new name (`…-v2.webp`) here, in both app bundles and in the
  landing-page `srcset`; never as a `?v=` bump, which the filename match would
  swallow
- `controller-test.html` + `assets/controller-test.{css,js}` — a stand-in game
  controller that exercises every touchpoint in the controller repo's
  `CONTRACT.md`, so the launcher can be tested without a real game and a game
  author can watch each one behave. `noindex`, and deliberately not in the
  sitemap. Update it in the same change that alters the contract — it is the only
  executable statement of that spec, and bump the `?v=` on its CSS/JS when you do,
  or the year-long `immutable` cache hides the change. See "Reaching it from the
  app" below
- `privacy.html`, `imprint.html` — legal pages (German, umbrella policy for all
  CouchPad infra); English versions in `en/`
- `assets/` — CSS (design tokens in `theme.css`), 16×9 game posters and square
  brand icons in `artwork/`
- `nginx.conf`, `Dockerfile` — the deployed container; fully static otherwise

## Local preview

```sh
python3 -m http.server 8000
```

## Reaching the test controller from the app

The launcher only loads a page as a controller if `JoinResolver` hands it to
`joinVerbatim`. **The apex can never do that**: every `couchpad.games` /
`www.couchpad.games` URL is routed to the sole live game's `controllerBaseUrl`
instead, whatever its path. A `couchpad.games` **subdomain** does load verbatim,
which is what `test.couchpad.games` exists for.

- **Any build — tap <https://test.couchpad.games/CPTEST>.** The 6-character path
  is not decoration: it is all the Android App Links intent filter claims, so a
  shorter or longer one opens the browser instead of the app. Traefik maps it to
  `controller-test.html` (host-scoped, in the private cluster repo — the same
  alias in `nginx.conf` would shadow that room code on the apex for a real player).
- **Debug launcher builds, over the LAN** — for iterating without a deploy. Serve
  this directory and scan the QR with the app's own scanner; private hosts take a
  debug-only branch in `JoinResolver` that exists for exactly this. Manual code
  entry can't be used — it caps input at 16 characters and resolves through the
  relay.

  ```sh
  python3 -m http.server 8000
  qrencode -t ANSIUTF8 "http://$(ipconfig getifaddr en0):8000/controller-test"
  ```

Either way **no room, no relay and no display are involved** — `joinVerbatim`
loads the URL as given, and the room code only labels the home rejoin card (which
is offered unverified when the URL surfaces none).

The test host serves this whole site, so an `X-Robots-Tag: noindex` middleware
covers it; the page carries a `noindex` meta of its own.
