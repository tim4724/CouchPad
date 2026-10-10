# couchpad.games

Static landing site for **CouchPad** — the umbrella brand for party games
where everyone plays together on the TV/screen and phones are the controllers
(scan a QR to play, no install required).

Flagship game: **HexStacker Party** — live at
[hexstacker.com](https://hexstacker.com) and on the
[Apple TV App Store](https://apps.apple.com/app/hexstacker-party/id6788876779).
**Tiny Track Party** (kart racer) is playable at
[tinytrack.couchpad.games](https://tinytrack.couchpad.games);
**Powder** (skiing) is still in development.

The Android TV builds and the phone controller are in closed testing, gated on
the [testers Google Group](https://groups.google.com/g/couchpadgames) — a Play
listing 404s for anyone who isn't a member yet. The landing page deliberately
says nothing about that: it links only what a visitor can actually open. Testers
are recruited by link instead, through `/beta` (`/de/beta`); delete those pages
and `assets/beta.css` once the apps are in production.

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
  landing page (each poster's `srcset` appears twice, on the poster and on its
  blurred `.ambient__bg` copy; keep the two identical so they share one
  download); never as a `?v=` bump, which the filename match would swallow.
  `video` is a trailer on the game's own server; the apps cache it by
  full URL forever too, but ship no copy to match, so a re-rendered trailer is a
  `?v=` bump on `video` (here and in both app bundles), made only once the new
  file is live on the game's server
- `controller-test.html` + `assets/controller-test.{css,js}` — a stand-in game
  controller that exercises every touchpoint in the controller repo's
  `CONTRACT.md`, so the launcher can be tested without a real game and a game
  author can watch each one behave. `noindex`, and deliberately not in the
  sitemap. Update it in the same change that alters the contract — it is the only
  executable statement of that spec, and bump the `?v=` on its CSS/JS when you do,
  or the year-long `immutable` cache hides the change. See "Reaching it from the
  app" below
- `beta.html`, `de/beta.html` + `assets/beta.css` — closed-test sign-up steps
  (group, per-app opt-in links, install, 14 days), shared by link. `noindex`, not
  in the sitemap
- `privacy.html`, `imprint.html` — legal pages (German, umbrella policy for all
  CouchPad infra); English versions in `en/`
- `assets/` — CSS (design tokens in `theme.css`), 16×9 game posters and square
  brand icons in `artwork/`
- `nginx.conf`, `Dockerfile` — the deployed container; fully static otherwise

## Local preview

Serve the repo through the production nginx config, so room links
(`/<CODE>`), extensionless pages (`/privacy`) and the security headers (CSP)
behave as deployed. The repo is mounted, so edits show on reload, but CSS/JS
are served `immutable`: bump their `?v=` or disable the browser cache while
iterating.

```sh
docker run --rm -p 8000:8080 \
  -v "$PWD":/usr/share/nginx/html:ro \
  -v "$PWD/nginx.conf":/etc/nginx/conf.d/default.conf:ro \
  -v "$PWD/security-headers.conf":/etc/nginx/snippets/security-headers.conf:ro \
  nginxinc/nginx-unprivileged:1.27-alpine
```

`python3 -m http.server 8000` is enough for the landing page alone; it knows
none of the nginx routes, so room links and `/privacy` 404 there.

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
