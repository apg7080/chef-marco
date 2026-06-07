# Chef Marco `_dist/`

Shared runtime assets loaded by `_template.html` (wired by Lane A). Each recipe HTML pulls these from a relative `../_dist/` path, so the folder stays unversioned per recipe and a single change here lands everywhere.

- `print.css`: print-only stylesheet (`media="print"`). Collapses split grids, hides hero caption and pill row, scales type for A4, kills entrance reveal animations, keeps the warm-paper background. Printers drop backgrounds by default, so screen feel stays without forcing ink usage.
- `manifest.json`: PWA manifest. `start_url` and `scope` are `./`, so each recipe HTML installs as its own standalone shortcut. `theme_color: #c46a3a` is the sRGB hex equivalent of the clay token `oklch(0.58 0.16 45)`. JSON cannot carry comments, and several browsers still ignore OKLCH in manifest fields, so hex is the safe choice. `background_color: #f6f1e7` mirrors the warm paper.
- `icon-192.svg`, `icon-512.svg`: install icons. Clay disc, lowercase serif `m`.
- `sw.js`: service worker. Network-first with cache fallback. Precaches the global assets, lets recipe-specific images and HTML populate the cache on first visit so the recipe works offline after it has been opened once. GET only, same-origin only.
- `tap-step.js`: kitchen mode. Self-mounts a 56px clay Cook button (bottom-right) when the page has `ol.steps`. Tapping opens a full-screen single-step view with large tap zones, keyboard support (Esc, arrows, space), and reduced-motion respect. Idempotent.

Lane A registers the service worker and the manifest from `_template.html`. This folder does not need a build step.
