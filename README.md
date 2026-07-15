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
Plain static site — no build step. Hosted on **Cloudflare Pages** with the build output directory set to the repository root.

## Notes
- `wordpress-plugin/` contains the staff **Art Catalog** plugin used on the separate WordPress back office (not part of the public static site).
