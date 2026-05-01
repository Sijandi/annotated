# Seed Data for Demo

The social feed needs to feel populated in the demo. Pre-create these annotations in the Supabase dashboard before recording.

## Fake users (5)

| username | display_name | avatar |
|---|---|---|
| @sarah_builds | Sarah Lin | random pravatar.cc URL |
| @maxonai | Max Chen | random pravatar.cc URL |
| @devon_dao | Devon Wright | random pravatar.cc URL |
| @aria_writes | Aria Patel | random pravatar.cc URL |
| @kai_invests | Kai Morrison | random pravatar.cc URL |

Insert into `auth.users` via admin API or directly via Supabase service role, then a profile row will auto-create. Alternatively just insert directly into `profiles` with a fake `id` (UUID) and skip the auth trigger for seed data.

## Fake annotations (6)

Mix of source types to show variety in the feed.

### 1. TWiST clip (different episode from the demo's)
- **user:** @sarah_builds
- **source:** TWiST E2243 "SpaceX + xAI deal"
- **clip:** 0:14 → 1:32
- **commentary (text):** "The Musk Industries arc is wild. If xAI gets folded into SpaceX, we're going to see AI infra at orbital scale within 3 years. Not 'data centers in space' as marketing — actual latency advantages for global services."

### 2. News article highlight
- **user:** @maxonai
- **source:** Tech article on GPU export controls
- **clip_text:** Highlighted paragraph (~150 chars)
- **commentary (text):** "This is the second-order effect nobody talks about: domestic chip designers are now operating with a 12-month head start vs. anyone in restricted markets. Compounding advantage."

### 3. Podcast clip
- **user:** @devon_dao
- **source:** Lex Fridman or All-In podcast (anything popular)
- **clip:** ~75s audio
- **commentary (audio):** Pre-record a 20s thoughtful audio response. (Use TTS if needed — 11labs voice clone or similar.)

### 4. Another TWiST clip
- **user:** @aria_writes
- **source:** TWiST E2258 "Is Anthropic Making the Biggest Mistake in AI History?"
- **clip:** 0:30 → 1:45
- **commentary (text):** "Jason's framing this as a binary — release vs. don't release — but the actual question is who gets early access. Pentagon partnerships aren't 'release,' they're tiered access. The frame matters."

### 5. News article
- **user:** @kai_invests
- **source:** Bloomberg or WSJ on a recent IPO
- **clip_text:** Highlighted financial detail
- **commentary (text):** "Look at the price-to-revenue ratio in the prospectus. They're betting on the AI premium holding through Q3. If it doesn't, this prices in a 40% haircut on day-one comps."

### 6. Your own annotation (the demo's)
- **user:** your real account
- **source:** TWiST E~2280 (the one we picked for the demo)
- **clip:** the moment you choose
- **commentary (audio):** Recorded live in the demo capture

## Comments

Add 2-3 comments on each seeded annotation from other seeded users so the comment threads aren't empty. Keep them short and substantive. Examples:

> @maxonai on Sarah's TWiST clip: "Latency for what though? Most consumer services are CDN-cached. Maybe high-freq trading?"
> @sarah_builds replying: "Trading is the obvious one. Also realtime gaming netcode for global lobbies."

## Follow graph

Have your demo user (`@philv` or whatever) follow 3 of the seeded users. Have 2 of the seeded users follow you. The "Following" filter on the feed needs to show non-empty.

## Insert SQL skeleton

```sql
-- Run as service role
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'sarah@seed.test', '{"user_name":"sarah_builds","full_name":"Sarah Lin","avatar_url":"https://i.pravatar.cc/150?img=1"}'),
  ('22222222-2222-2222-2222-222222222222', 'max@seed.test',   '{"user_name":"maxonai","full_name":"Max Chen","avatar_url":"https://i.pravatar.cc/150?img=2"}'),
  -- ... etc
;

-- Profile rows auto-create via trigger.

-- Annotations
insert into public.annotations (
  user_id, source_url, source_type, source_title,
  clip_start_seconds, clip_end_seconds, media_url,
  commentary_text, status, slug
)
values (
  '11111111-1111-1111-1111-111111111111',
  'https://www.youtube.com/watch?v=...',
  'youtube',
  'TWiST E2243: SpaceX + xAI deal',
  14, 92,
  'https://your-project.supabase.co/storage/v1/object/public/clips/seed-1.mp4',
  'The Musk Industries arc is wild...',
  'published',
  'spacex-xai-orbital-scale'
);
-- ... etc
```

For seed video/audio files: pre-transcode 5 short clips (you can use the worker locally) and drop them in the `clips` bucket. Use real but trivially short snippets so storage cost is nothing.
