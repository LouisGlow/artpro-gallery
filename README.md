# ArtPro Gallery — website

Static marketing site for **ArtPro Gallery** — South African art across four galleries in and around Johannesburg.

## Pages
- `index.html` — home
- `about.html`, `services.html` + service detail pages (`framing.html`, `commission.html`, `valuations.html`, `hanging-of-paintings.html`, `delivery.html`, `auctions.html`, `statues.html`, `carpets.html`, `lamps.html`)
- `artists.html` — artist directory (cards → bio pages)
- `artist.html` — per-artist bio template (`artist.html?a=<slug>`)
- `art-by-artists.html` — collection grouped by artist
- `art-for-sale.html`, `contact.html`
- `interactive-gallery.html` — immersive "Virtual Gallery"

## Assets
- `styles.css`, `site.js`
- `assets/images/…`, `assets/artists-data.js` (powers artist cards/bios)

## Deploy
Plain static site — no build step. The publishable site lives in **`public/`**.

Hosted on **Cloudflare** (Workers static assets). `wrangler.toml` sets
`[assets] directory = "./public"`, so only that folder is served — the repo
root (plugin source, internal notes) is not published. Every push to `main`
redeploys.

## Notes
- `wordpress-plugin/` contains the staff **Art Catalog** plugin used on the separate WordPress back office (kept in the repo root, **not** part of the public site).
