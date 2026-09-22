# Getting Sponsor Command live

A checklist, in the order that avoids backtracking. Everything happens in a
browser — there is no terminal step.

Three accounts, all free to start: **Supabase** (the database), **Google Cloud**
(reading the inbox), **Vercel** (the website). Budget about 30 minutes.

The order matters. Google needs to know your Vercel address before you can
finish it, so Vercel comes first and Google second — the reverse of how most
guides do it, and the reason they make you go back and edit things.

---

## Before you start

The code has to be on `main` for Vercel to deploy it by default. Right now it
is on a branch, in [pull request #1](https://github.com/shaneowenmichelon-hub/Jarvis/pull/1).
Merge that first (green **Merge pull request** button), or ask and it can be
merged for you.

---

## 1. Supabase — the database

1. Sign up at [supabase.com](https://supabase.com) → **New project**.
   Any region. Free tier is plenty. Save the database password it asks you to
   set — you will not need it again, but losing it is annoying.
2. Wait for the project to finish provisioning (a minute or two).
3. Left sidebar → **SQL Editor** → **New query**. Open
   [`supabase/schema.sql`](supabase/schema.sql) in this repo, copy the whole
   file, paste it in, press **Run**. It should say success.
4. Left sidebar → **Project Settings** → **API**. Copy these three somewhere
   for the next steps:

   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string
   - **service_role** key — a different long string

> The **service_role** key bypasses every security rule in the database. It
> goes in Vercel's settings and nowhere else. Never paste it into a webpage, a
> chat, or this repository.

---

## 2. Vercel — put it on the internet

1. Sign up at [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New → Project**, find `shaneowenmichelon-hub/Jarvis`, **Import**.
3. It is a standard Next.js app — leave every build setting alone.
4. Expand **Environment Variables** and add these. The Google ones come in
   step 3; leave them out for now.

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key from step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key from step 1 |
   | `ALLOWED_DOMAIN` | `zmmevents.com` |
   | `ALLOWED_EMAILS` | `shane@zmmevents.com,zach@zmmevents.com` |
   | `OWN_DOMAINS` | `zmmevents.com` |
   | `CRON_SECRET` | any long random string — see note below |

5. **Deploy.** When it finishes, copy your address. It looks like
   `https://jarvis-xxxx.vercel.app`. **Write it down — step 3 needs it.**

Opening it now will show the sign-in page and fail to let you in. That is
expected; Google is not connected yet.

> **`CRON_SECRET`** is just a password that stops strangers triggering scans.
> Any long random string works — mash the keyboard if you like. You will need
> the same value again in step 6, so save it.

---

## 3. Google Cloud — permission to read the inbox

Sign in as **shane@zmmevents.com**, not a personal Google account.

1. [console.cloud.google.com](https://console.cloud.google.com) → create a
   project, call it anything.
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **APIs & Services → OAuth consent screen**:

   - If zmmevents.com is Google Workspace (your email is `@zmmevents.com`, so
     almost certainly yes) choose **Internal**.
   - **This choice matters more than it looks.** On **External**, Google
     expires the connection every 7 days until the app passes a review that
     takes weeks. The dashboard would go dark every Monday and you would have
     to reconnect Gmail by hand. **Internal** has no such limit and needs no
     review. If Internal is greyed out, stop here and say so — there is a way
     around it, but it is worth knowing before you build on it.

4. Add the scope `https://www.googleapis.com/auth/gmail.readonly`. That is the
   only one. It cannot send, delete, or label anything.
5. **Credentials → Create credentials → OAuth client ID → Web application.**
6. Under **Authorised redirect URIs**, add all three. Replace the bracketed
   parts with your real addresses:

   ```
   https://[your-project].supabase.co/auth/v1/callback
   https://[your-vercel-address].vercel.app/api/gmail/callback
   http://localhost:3000/api/gmail/callback
   ```

   A typo here produces a `redirect_uri_mismatch` error later, and it is the
   single most common thing to get wrong. Copy and paste; do not retype.

7. **Create**, then copy the **Client ID** and **Client secret**.

---

## 4. Join the three together

1. **In Supabase** → **Authentication → Sign In / Providers → Google**: enable
   it, paste the same Client ID and secret, save.
2. **In Vercel** → **Settings → Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | from step 3 |
   | `GOOGLE_CLIENT_SECRET` | from step 3 |

3. **Deployments → ⋯ → Redeploy.** Environment variables only take effect on a
   new deployment; this is the second most common thing to get stuck on.

---

## 5. First run

1. Open your Vercel address and **sign in with Google**. Only addresses on
   `zmmevents.com` get in.
2. **Settings → Connect Gmail**, approve the screen. It will say the app wants
   to read your mail — read is the only thing it asks for.
3. Press **Scan now**. The first run reaches back six months and takes a few
   minutes. Later runs only read what is new.

You should land on the same two tabs you have seen in the screenshots, except
reading your live inbox instead of the seeded copy.

---

## 6. Make it hourly

Vercel's free plan runs cron **once a day**, not hourly. Pick one:

- **GitHub Actions — free.** In the repo: **Settings → Secrets and variables →
  Actions → New repository secret**, twice:
  - `DASHBOARD_URL` — your Vercel address
  - `CRON_SECRET` — the same value from step 2

  [`.github/workflows/scan.yml`](.github/workflows/scan.yml) is already written
  and will start firing on the hour. Then delete the `crons` block from
  [`vercel.json`](vercel.json) so the work is not queued twice.

- **Vercel Pro — about $20/month.** [`vercel.json`](vercel.json) already
  schedules it hourly. Nothing else to do.

The dashboard header shows when the last scan ran and turns amber after three
hours, because a scheduler that quietly stopped is the failure worth catching.

---

## When something goes wrong

| What you see | What it means |
|---|---|
| `redirect_uri_mismatch` | The URI in step 3.6 does not exactly match. Check `https` vs `http`, and trailing slashes. |
| Signed in, but "not allowed" | Your address is not in `ALLOWED_EMAILS` / `ALLOWED_DOMAIN`, or you did not redeploy after adding it. |
| Board is empty after a scan | No form submissions in the window yet, or Gmail is not connected. **Settings** shows both. |
| Banner says "Running locally on seeded data" | Vercel cannot see the Supabase variables. Check the three names in step 2 for typos, then redeploy. |
| Gmail disconnects every week | The consent screen is **External**. See step 3.3. |

Anything else: screenshot the error and send it over.
