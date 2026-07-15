# Going live — ArtPro catalog database

The site already deploys to Cloudflare when you `git push` (Cloudflare builds it on
their own servers). We add a **D1 database** and switch on the **API Worker** so staff
capture into a real, shared database.

> **Why no command line:** the `wrangler` CLI can't run on this Windows-on-ARM machine
> (its `workerd` component has no ARM build). So we create the database in the Cloudflare
> **dashboard**, and let the normal `git push` deploy do the rest. The Worker creates its
> own table automatically on first use — no migration command needed.

## 1. Create the database (dashboard)
1. Go to **https://dash.cloudflare.com** and sign in.
2. Left sidebar → **Storage & Databases** → **D1 SQL Database** (older accounts: under
   **Workers & Pages**).
3. Click **Create** (or **Create database**). Name it exactly: `artpro-catalog`. Create it.
4. Open the new database. On its overview page copy the **Database ID** (a long id like
   `a1b2c3d4-...`). **Paste that id to Claude** — it goes into `wrangler.toml`.

## 2. Claude wires it up + you push
Claude puts the id into `wrangler.toml`, commits, and you (or Claude) `git push`. That push
triggers Cloudflare to redeploy — this time with the Worker + database bound.

## 3. Check it
- Visit `https://artpro-gallery.louisvent.workers.dev/api/health` → should show `{"ok":true}`.
- Open `/add-a-piece.html`, capture a piece, then open `/catalog.html` — it's there, and
  it shows up on any device (it's in the shared database now).

## (Optional) sample rows
To pre-fill the six demo pieces: open the database in the dashboard → **Console** tab →
paste the contents of `migrations/seed.sql` → **Execute**. Or just skip it and start
capturing real pieces.

---

## Important: lock it down before sharing the links
Right now `/api/*` is **open** — anyone with the URL could add or edit pieces. Before you
rely on it, gate the staff pages with **Cloudflare Access** (free, no code):
1. Dashboard → **Zero Trust** → **Access** → **Applications** → *Add self-hosted*.
2. Cover `/catalog.html`, `/add-a-piece.html`, and `/api/*`.
3. Policy: allow only staff emails (Lee, Jaline).

## Custom domain (when ready)
Dashboard → this Worker → **Settings → Domains & Routes → Add Custom Domain** → enter the
client's domain (its DNS must be on Cloudflare). Everything keeps working — links and the
API are all relative.
