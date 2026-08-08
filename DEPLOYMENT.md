# Deploying CMS CSR Intelligence

Target: **Render**, Docker runtime, with a persistent disk so in-app uploads survive
redeploys, and a shared password in front of everything.

---

## Step 0 — Verify the build locally (do this first)

I could not complete a production build from my side (the shared-folder connection is
too slow to finish inside my time limit). TypeScript passes cleanly, which catches most
problems, but **run this before you push** — it is the gate between working and a failed
deploy:

```bash
npm run build
```

If it fails, send me the error and I'll fix it. If it succeeds you'll see a route table
listing `/`, `/ai-insights`, `/data-upload`, `/api/...` and so on.

---

## Step 1 — Put the project in a Git repository

Render deploys from Git. From `E:\DownloadFolder\csr-dashboard`:

```bash
git init
git add .
git commit -m "CMS CSR Intelligence dashboard"
git branch -M main
git remote add origin https://github.com/<you>/csr-dashboard.git
git push -u origin main
```

`data/dataset.json` (~3.8 MB) **is** committed on purpose — it seeds the disk on first
boot so the dashboard is populated the moment it comes up. `data/raw/` (the 9.7 MB
workbook) and `data/backup/` are excluded by `.dockerignore`; add them to `.gitignore`
too if you'd rather not keep the source workbook in the repo.

---

## Step 2 — Create the service on Render

1. Sign in at [render.com](https://render.com) → **New** → **Blueprint**
2. Connect the repository. Render reads `render.yaml` and provisions:
   - a Docker web service (`starter`, 512 MB, Singapore region)
   - a 1 GB persistent disk mounted at `/var/data`
   - a health check on `/api/meta`
3. When prompted for the environment variables marked `sync: false`, set:

| Variable | Value | Purpose |
| --- | --- | --- |
| `APP_PASSWORD` | pick something strong | The shared password. **Required** — leaving it blank disables the gate entirely. |
| `LLM_API_KEY` | *(optional)* | Enables AI narration + the chat box. Everything else works without it. |
| `LLM_PROVIDER` | `anthropic` or `openai` | Only if you set a key. |

4. **Create** → first build takes 5–10 minutes.

You'll get a URL like `https://cms-csr.onrender.com`. The browser will prompt for
credentials: leave the username blank (or type anything) and enter `APP_PASSWORD`.

---

## Step 3 — Confirm it came up correctly

- `/api/meta` returns JSON with your row and company counts
- The Executive Dashboard shows ₹39,712 Cr across 1,116 companies
- **Data Upload → upload a file → Replace** — then reload. If the new numbers survive a
  redeploy, the disk is wired up correctly.

---

## How the persistent disk works

`CSR_DATA_DIR=/var/data` points the app at the mounted disk instead of the image.

- **First boot:** `docker-entrypoint.sh` sees an empty disk and copies the seeded
  dataset across.
- **Every later boot:** it finds an existing `dataset.json` and leaves it alone, so a
  redeploy never overwrites data you uploaded.
- **Backups** (`/var/data/backup/`) live on the same disk, so rollback survives
  redeploys too.

This is exactly why Render was the right call over Vercel: Vercel's filesystem is
read-only, so the upload, merge and rollback features could not work there without
rewriting the storage layer against a blob store.

---

## Costs

| Item | Cost |
| --- | --- |
| Render Starter web service | ~$7/month |
| 1 GB persistent disk | ~$0.25/month |
| **Total** | **~$7.25/month** |

Render's free tier does **not** support persistent disks and sleeps after inactivity
(30–60 s cold start), so it isn't suitable for showing this to partners.

---

## Updating

Push to `main` and Render rebuilds automatically (`autoDeploy: true`).

New CSR data does **not** need a deploy — upload it through the Data Upload page and it
takes effect immediately.

---

## Alternative: Railway

Railway works identically — it reads the same `Dockerfile`. Create a volume mounted at
`/var/data`, set the same environment variables, and it behaves the same. Pricing is
usage-based rather than flat.

## Alternative: your own server

```bash
docker build -t cms-csr .
docker run -d --name cms-csr \
  -p 3000:3000 \
  -e APP_PASSWORD='your-password' \
  -e CSR_DATA_DIR=/var/data \
  -v /srv/cms-data:/var/data \
  --restart unless-stopped \
  cms-csr
```

Put nginx or Caddy in front for TLS. Caddy is two lines:

```
csr.yourdomain.com {
    reverse_proxy localhost:3000
}
```

---

## Security notes

- The password gate is HTTP Basic auth in `src/middleware.ts`, applied to **every**
  route including the API and report downloads. Compare is constant-time.
- Basic auth sends credentials on every request — fine over HTTPS (Render terminates TLS
  for you), not fine over plain HTTP.
- One shared password means no per-user audit trail. If you need named accounts later,
  that's a swap to NextAuth or similar — say the word.
- **Anyone with the password can replace the dataset.** If you're sharing the URL with
  prospective partners, either hand out view access only after the data is final, or ask
  me to split the upload page behind a second, separate password.
