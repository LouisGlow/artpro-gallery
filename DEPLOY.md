# Going live — ArtPro catalog database

The site already deploys to Cloudflare. These steps add the **D1 database** and the
**API Worker** so staff can capture pieces into a real, shared database instead of
just this browser.

You run these (they need *your* Cloudflare login — Claude can't do that part). Each
uses `npx wrangler`, so nothing needs to be installed first.

> **Windows tip:** this repo lives in OneDrive, which sometimes locks files mid-sync
> and makes `wrangler` fail with `EBUSY`. If a command errors that way, **pause
> OneDrive sync** (system tray → OneDrive → Pause) and re-run it.

## 1. Sign in to Cloudflare
```
npx wrangler login
```
A browser opens — approve access. One time only.

## 2. Create the database
```
npx wrangler d1 create artpro-catalog
```
It prints a block ending with a `database_id = "..."`. **Copy that id** and paste it
into `wrangler.toml`, replacing `REPLACE_WITH_DATABASE_ID`.

## 3. Create the table (in the live database)
```
npx wrangler d1 execute artpro-catalog --remote --file=migrations/0001_init.sql
```

## 4. (Optional) Load the six sample pieces
Skip this to start with an empty catalog.
```
npx wrangler d1 execute artpro-catalog --remote --file=migrations/seed.sql
```

## 5. Deploy
```
npx wrangler deploy
```

## 6. Check it
- Visit `https://artpro-gallery.louisvent.workers.dev/api/health` → should show `{"ok":true}`.
- Open `/catalog.html` — the pieces now come from the database.
- Open `/add-a-piece.html`, capture a piece — it appears in the catalog on any device.

(After this, a `git push` still redeploys the static pages automatically. The Worker/DB
changes above only need to be run when they change — normally just this once.)

---

## Important: lock it down before sharing the links

Right now the `/api/*` endpoints are **open** — anyone with the URL could add or edit
pieces. Before you rely on it, gate the staff pages with **Cloudflare Access** (free,
no code):

1. Cloudflare dashboard → **Zero Trust** → **Access** → **Applications** → *Add self-hosted*.
2. Cover these paths: `/catalog.html`, `/add-a-piece.html`, and `/api/*`.
3. Add a policy allowing only staff emails (e.g. Lee's, Jaline's).

Then only signed-in staff can reach the catalog or the API. This is the "staff login"
made real, and it's the recommended next step.

## Custom domain (when ready)
When the client wants it on their own domain: Cloudflare dashboard → this Worker →
**Settings → Domains & Routes → Add Custom Domain** → enter the domain (its DNS must be
on Cloudflare). Everything keeps working — all links and the API are relative.
