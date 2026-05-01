-- Row-level security for Annotated
-- Public read on published annotations and profiles; writes restricted to owners

-- =============================================================================
-- profiles
-- =============================================================================
alter table public.profiles enable row level security;

create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- profile rows are inserted automatically via the auth trigger; no manual insert allowed

-- =============================================================================
-- annotations
-- =============================================================================
alter table public.annotations enable row level security;

create policy "published annotations are publicly readable"
  on public.annotations for select
  using (status = 'published' or auth.uid() = user_id);

create policy "users insert own annotations"
  on public.annotations for insert
  with check (auth.uid() = user_id);

create policy "users update own annotations"
  on public.annotations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own annotations"
  on public.annotations for delete
  using (auth.uid() = user_id);

-- =============================================================================
-- follows
-- =============================================================================
alter table public.follows enable row level security;

create policy "follows are publicly readable"
  on public.follows for select
  using (true);

create policy "users follow on own behalf"
  on public.follows for insert
  with check (auth.uid() = follower_id);

create policy "users unfollow on own behalf"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- =============================================================================
-- comments
-- =============================================================================
alter table public.comments enable row level security;

create policy "comments are publicly readable"
  on public.comments for select
  using (true);

create policy "users insert own comments"
  on public.comments for insert
  with check (auth.uid() = user_id);

create policy "users delete own comments"
  on public.comments for delete
  using (auth.uid() = user_id);

-- =============================================================================
-- claims
-- =============================================================================
alter table public.claims enable row level security;

-- Anyone (logged in or not) can submit a claim
create policy "anyone can submit a claim"
  on public.claims for insert
  with check (true);

-- Only authenticated users can view their own claims; admins via service role bypass RLS
create policy "users see claims on their own annotations"
  on public.claims for select
  using (
    exists (
      select 1 from public.annotations a
      where a.id = annotation_id and a.user_id = auth.uid()
    )
  );
