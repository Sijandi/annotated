# Web App

The public-facing web app. Built initially in Lovable, exported here for version control and customization.

Routes:
- `/` — landing page
- `/feed` — public social feed
- `/a/[slug]` — annotation landing page (clip + commentary + source link + claim button)
- `/u/[username]` — profile page (v2, not required for submission)

## Status

Day 0: empty. Day 1: Lovable scaffold lands here.

## Local dev (after Lovable export)

```bash
cd web
npm install
npm run dev
```

## Env vars

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
