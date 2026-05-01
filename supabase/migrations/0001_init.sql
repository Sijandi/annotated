-- Annotated.com — initial schema
-- Run order: 0001_init.sql then 0002_rls.sql then 0003_storage.sql

-- =============================================================================
-- profiles: extends auth.users with public-facing user info
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz default now()
);

create index profiles_username_idx on public.profiles (username);

-- Auto-create a profile row when a new auth.users row is inserted
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'user_name',
      new.raw_user_meta_data->>'preferred_username',
      'user_' || substring(new.id::text from 1 for 8)
    ),
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- annotations: a clip + commentary on a piece of source content
-- =============================================================================
create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- source
  source_url text not null,
  source_type text not null check (source_type in ('youtube', 'article', 'podcast')),
  source_title text,
  source_author text,
  source_thumbnail_url text,

  -- clip data
  clip_start_seconds numeric,
  clip_end_seconds numeric,
  clip_text text,                    -- for article highlights
  media_url text,                    -- transcoded video/audio in storage
  thumbnail_url text,

  -- commentary
  commentary_text text,
  commentary_audio_url text,

  -- meta
  status text not null default 'processing' check (
    status in ('processing', 'published', 'flagged', 'removed', 'failed')
  ),
  slug text unique not null,
  error_message text,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- enforce 90-second max for video/audio clips
  constraint clip_under_90s check (
    clip_start_seconds is null or clip_end_seconds is null or
    (clip_end_seconds - clip_start_seconds) <= 90
  )
);

create index annotations_user_id_idx on public.annotations (user_id);
create index annotations_status_created_idx on public.annotations (status, created_at desc);
create index annotations_slug_idx on public.annotations (slug);

-- Auto-update updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger annotations_touch_updated_at
  before update on public.annotations
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- follows: directed edges between profiles
-- =============================================================================
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, followed_id),
  constraint no_self_follow check (follower_id != followed_id)
);

create index follows_followed_idx on public.follows (followed_id);

-- =============================================================================
-- comments: on annotations
-- =============================================================================
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid not null references public.annotations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) > 0 and length(body) <= 2000),
  created_at timestamptz default now()
);

create index comments_annotation_idx on public.comments (annotation_id, created_at);

-- =============================================================================
-- claims: fair use / DMCA disputes
-- =============================================================================
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid not null references public.annotations(id) on delete cascade,
  claimant_email text not null,
  claimant_name text,
  reason text not null check (length(reason) > 0 and length(reason) <= 5000),
  status text not null default 'open' check (
    status in ('open', 'reviewing', 'upheld', 'rejected')
  ),
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create index claims_status_idx on public.claims (status, created_at desc);
create index claims_annotation_idx on public.claims (annotation_id);
