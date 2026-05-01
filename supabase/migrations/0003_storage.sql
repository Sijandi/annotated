-- Storage buckets for Annotated
-- Run after the schema and RLS migrations

-- =============================================================================
-- clips: transcoded video and audio media
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('clips', 'clips', true)
on conflict (id) do nothing;

-- =============================================================================
-- commentary: user-recorded audio commentary
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('commentary', 'commentary', true)
on conflict (id) do nothing;

-- =============================================================================
-- avatars: user profile images
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- =============================================================================
-- Storage RLS policies
-- =============================================================================

-- clips: writes from service role only (worker), public read
create policy "clips public read"
  on storage.objects for select
  using (bucket_id = 'clips');

-- commentary: authenticated users upload to their own folder, public read
create policy "commentary public read"
  on storage.objects for select
  using (bucket_id = 'commentary');

create policy "users upload commentary to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'commentary'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- avatars: authenticated users upload to their own folder, public read
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users upload avatar to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users update own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
