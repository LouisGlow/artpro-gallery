# Scrape Summary — ArtPro Gallery

> Source: https://www.artprogallery.co.za/
> Scrape date: 2026-07-14
> Platform detected: WordPress + Hello Elementor theme + Elementor Pro + WooCommerce

---

## Pages Successfully Scraped
| Page | URL | Status |
|---|---|---|
| Home | https://www.artprogallery.co.za/ | 200 OK |
| About | https://www.artprogallery.co.za/about-2/ | 200 OK |
| Services | https://www.artprogallery.co.za/services/ | 200 OK |
| Artists | https://www.artprogallery.co.za/all-artists/ | 200 OK |
| Contact | https://www.artprogallery.co.za/contact-us/ | 200 OK |

## Pages Discovered but Not Separately Scraped
These are WooCommerce shop/category listings (product grids) rather than editorial content — noted for the rebuild but not fetched in full:
- Art For Sale — https://www.artprogallery.co.za/art-for-sale/
- Art by Mediums — https://www.artprogallery.co.za/art-by-mediums/
- Art by Artists — https://www.artprogallery.co.za/art-by-artists/
- Latest News (blog category) — /category/latest-news/
- Cookie Policy — /cookie-policy-za/
- Privacy Policy — /privacy-policy-2/

## Pages Attempted but Not Found
- None. No 404s encountered. (No dedicated /team, /pricing, /faq, /testimonials, or /blog pages exist on this site.)

---

## CSS Stylesheets Saved
| Filename | Original URL |
|---|---|
| theme.css | https://www.artprogallery.co.za/wp-content/themes/hello-elementor/assets/css/theme.css?ver=3.4.9 |
| header-footer.css | https://www.artprogallery.co.za/wp-content/themes/hello-elementor/assets/css/header-footer.css?ver=3.4.9 |
| barlowcondensed.css | https://www.artprogallery.co.za/wp-content/uploads/elementor/google-fonts/css/barlowcondensed.css?ver=1742272231 |
| montserrat.css | https://www.artprogallery.co.za/wp-content/uploads/elementor/google-fonts/css/montserrat.css?ver=1742272255 |
| elementor-inline.css | Extracted from the 13 inline `<style>` blocks on the homepage (Elementor global colours, typography & per-widget CSS) |

**Skipped (framework/CDN CSS, per rules):** woocommerce-layout.css, woocommerce.css, woocommerce-smallscreen.css, wc-blocks.css, cookieblocker.min.css, hello-elementor reset.css, elementor frontend.min.css + all widget-*.min.css, elementor-icons, font-awesome (all/solid/brands/regular/shim), swiper, animation libs, jet-search / chosen.

---

## Images Downloaded (19)
- logo.png
- logo-alt.jpg
- favicon.jpg
- hero.jpg
- img-pianist-markus.jpg
- img-vintage-carscene.jpg
- img-abstract.jpg
- svc-acrylic.jpg
- svc-canvas.jpg
- svc-ceramics.jpg
- svc-charcoal.jpg
- svc-etching.jpg
- svc-linocut.jpg
- svc-mixed-medium.jpg
- svc-oil.jpg
- svc-pastel.jpg
- svc-print.jpg
- svc-stretched-canvas.jpg
- svc-watercolour.jpg

## Images That Failed to Download
- None. All targeted images downloaded successfully.

## Notes on Images
- WooCommerce product images (individual artworks for sale, artist portraits) are numerous and load dynamically from category/shop pages — not bulk-downloaded. The homepage/services/about images and brand assets were captured.
- `woocommerce-placeholder-300x300.png` appears where products have no image — skipped (placeholder, not real content).

---

## Dynamically Loaded / Un-scrapeable Content
- **Artist portraits & artwork listings** — served via WooCommerce product grids on Art For Sale / Art by Mediums / Art by Artists. Individual product pages (price, medium, dimensions) were not enumerated.
- **Newsletter signup** — Elementor Pro form (POST endpoint), no static content.
- **"Request a Free Quote" popup** — Elementor popup modal (id 418/3009/3492) with a contact form.
- **Google Maps** — four locations link out to maps.app.goo.gl short links (no inline embed iframe).

---

## Client Input Checklist ([NEEDS CLIENT INPUT])

**Contact Details**
- [ ] WhatsApp number (no wa.me link on the current site)
- [ ] Trading / opening hours — full weekly schedule (Mon–Sun) for each of the 4 galleries

**Services** (page shows image tiles only — no written descriptions or prices)
- [ ] Full description + pricing for: Auctions
- [ ] Full description + pricing for: Framing / Framework
- [ ] Full description + pricing for: Hanging of Paintings
- [ ] Full description + pricing for: Valuations / Validation Certificates
- [ ] Full description + pricing for: Commission Work
- [ ] Full description + pricing for: Delivery
- [ ] Full description + pricing for: International Shipping
- [ ] Full description + pricing for: Interior Design Support
- [ ] Full description + pricing for: Statues
- [ ] Full description + pricing for: Carpets
- [ ] Full description + pricing for: Lamps
- [ ] Art Classes — fees and group package pricing

**Team**
- [ ] Lee Holloway — job title, qualifications, bio, photo
- [ ] Markus Le Grange — photo confirmation (bio captured from homepage)
- [ ] Any other staff members?

**Testimonials**
- [ ] No reviews/testimonials on site — supply customer testimonials (name, quote, rating) if wanted

**Social Media**
- [ ] LinkedIn URL (none found)
- [ ] TikTok URL (none found)
- [ ] Confirm which Facebook is primary (business page ArtProGalleries vs personal lee.holloway.1654)

---

## Other Observations for Rebuild
- Two logo variants exist: full logo (`logo.png`, transparent PNG) and a thumbnail crop (`logo-alt.jpg`). No dedicated white/dark logo variant found.
- Footer copyright reads "©Copyright 2026 LEE HOLLOWAY" and "Designed | Hosted | Maintained by ManageMyWebsite".
- Meta OG description contains typos ("bosts", "stunning" repeated in meta) — clean up on rebuild.
- Business was formerly branded "Emmanuel Art".
- Prison Break Market (Kyalami) serves double duty as a gallery and the art-classes venue.
- Design language: high-contrast black/white, Barlow Condensed uppercase display type with wide letter-spacing, Montserrat light body — an editorial gallery aesthetic. Gold (#E9BC00) is a minor accent.
