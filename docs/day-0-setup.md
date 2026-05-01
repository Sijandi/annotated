# Day 0 — Setup Checklist

Before any code today.

## Accounts to create or verify access

- [ ] Supabase account (free tier OK to start, upgrade if needed)
- [ ] Railway account ($5/mo Hobby plan for the worker)
- [ ] Lovable account (free tier OK)
- [ ] GitHub repo created and this scaffold pushed
- [ ] Google Cloud Console project (for Google OAuth)
- [ ] X (Twitter) Developer account (for X OAuth)

## OAuth provider setup

### Google
1. Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs
2. Application type: Web application
3. Authorized redirect URIs:
   - `https://<your-supabase-project>.supabase.co/auth/v1/callback`
4. Save Client ID and Client Secret
5. Paste into Supabase Dashboard → Authentication → Providers → Google

### X (Twitter)
1. X Developer Portal → Projects & Apps → Create new app
2. User authentication settings → Set up
   - App permissions: Read
   - Type of App: Web App, Automated App or Bot
   - Callback URI: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
   - Website URL: your eventual production URL
3. Save OAuth 2.0 Client ID and Client Secret
4. Paste into Supabase Dashboard → Authentication → Providers → Twitter

## Send LAUNCH team email

See `docs/launch-team-email.md`. Send it before you start coding.

## Reply to Jason about the broken demo video

Short, low-stakes X reply. Not part of the build, but free signal.

> "Hey Jason, demo video on annotated.lovable.app isn't loading for me — wanted to flag it. Working on a submission now."

Don't oversell. Don't promise a date. Just a flag + note that you're working on it.

## Repo setup

```bash
# Local
git init
git add .
git commit -m "scaffold: initial repo structure"

# Create empty repo on GitHub via web UI (call it `annotated`)
git remote add origin git@github.com:<your-username>/annotated.git
git branch -M main
git push -u origin main
```

## Day 1 starts when

- LAUNCH team email is sent (response not required to start)
- OAuth providers are configured in Supabase
- Repo is pushed to GitHub
- You've watched the chosen TWiST episode and identified your clip's exact start/end timestamps
