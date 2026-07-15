# ArtPro Art Catalog — WordPress plugin

A private, **staff-only** art catalog for ArtPro Gallery. Jaline (and any staff) log in and
capture pieces through a branded form on the site; every record is stored in the WordPress
database and can be exported as a CSV **BOM** at the end of the day. Nothing here is shown on
the public website.

Each piece captures:

| Field          | How it's stored            |
|----------------|----------------------------|
| Photo          | Featured image (Media Library) |
| Piece name     | Post title                 |
| Artist name    | Custom field               |
| Size of art    | Custom field               |
| Size of frame  | Custom field               |
| Catalogue ID   | Custom field (typed manually) |

---

## Install (do this on artprogallery.co.za)

1. **Zip the plugin folder.** Zip the `artpro-art-catalog` folder (the one containing
   `artpro-art-catalog.php`) so you have `artpro-art-catalog.zip`.
2. **Upload it.** In wp-admin go to **Plugins → Add New → Upload Plugin**, choose the zip,
   **Install Now**, then **Activate**.
   *(Alternatively, copy the `artpro-art-catalog` folder into `wp-content/plugins/` via FTP and
   activate it from the Plugins screen.)*

On activation it creates a new user role, **Gallery Staff**, and a hidden **Art Catalog** menu
in wp-admin.

## Give Jaline access

- **Users → Add New** (or edit her existing user) and set her **Role** to **Gallery Staff**.
  (Administrators and Editors already have access.)
- Gallery Staff can only capture/manage art pieces and upload photos — nothing else on the site.

## Create the two pages

Create two normal WordPress **Pages** and paste one shortcode into each:

1. **"Add a Piece"** → put `[artpro_capture]` in the content. This is the capture form.
2. **"Catalog"** (or "BOM") → put `[artpro_catalog]` in the content. This is the list + export.

Both pages **gate themselves**: a visitor who isn't a signed-in staff member sees a sign-in
prompt instead of the form/list, so it's safe even if the page URL is public. If you'd like an
extra layer, set those pages to **Private** as well.

Add links to those two pages in a staff menu, or just bookmark them.

## Day-to-day use

- **Capture:** Jaline opens the **Add a Piece** page, fills in the fields, chooses/takes a photo
  (on a phone the camera opens directly), and taps **Save to catalog**. A confirmation shows and
  the form clears for the next piece.
- **Review / BOM:** the **Catalog** page lists every piece with thumbnail and all fields, has a
  search box (name / artist / ID), and an **Export BOM (CSV)** button that downloads a
  spreadsheet-ready file (`artpro-catalog-bom-YYYY-MM-DD.csv`) — open it in Excel or Sheets.
- The same records are also editable in wp-admin under **Art Catalog** if you prefer the back office.

---

## Notes

- **Private by design.** The `art_piece` record type is registered non-public and excluded from
  search, so pieces never appear on the live site or in Google.
- **Security.** All actions check the staff capability and use WordPress nonces; text is
  sanitised, output is escaped, and only image uploads are accepted for the photo.
- **Photos** live in the normal Media Library, so they're backed up with the rest of the site.
- **No new database tables** — it uses WordPress's own posts/postmeta, so it's easy to back up
  and migrate.

## Extending it later

- **Add a field:** add an entry to the `APC_META` array near the top of the plugin, then add a
  matching `<input>` in the `[artpro_capture]` form and a column in `[artpro_catalog]`.
- **Auto-generate the Catalogue ID** instead of typing it: say the word and it can assign a
  sequential number (e.g. `AP-0001`) on save.
- **Restrict to specific galleries / add stock status / price** are all straightforward additions.

## Uninstalling

Deactivating the plugin hides the menu and shortcodes but **keeps your data**. The captured
pieces remain in the database (and photos in the Media Library) unless you delete them manually.
