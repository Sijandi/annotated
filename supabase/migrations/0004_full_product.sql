-- Full product data model: visibility, collections (prescribed media),
-- claim-flip (endorsements + license interest), curator topics.
-- Applied to production 2026-08-12 via management API; kept here as canonical record.

alter table public.annotations add column if not exists visibility text not null default 'public'
  check (visibility in ('public','unlisted'));
create index if not exists annotations_visibility_idx on public.annotations (visibility, status, created_at desc);

alter table public.annotations add column if not exists topics text[] not null default '{}';
alter table public.profiles add column if not exists topics text[] not null default '{}';

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 500),
  visibility text not null default 'unlisted' check (visibility in ('public','unlisted')),
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  annotation_id uuid not null references public.annotations(id) on delete cascade,
  position int not null default 0,
  note text check (char_length(note) <= 500),
  added_at timestamptz not null default now(),
  primary key (collection_id, annotation_id)
);
create index if not exists collection_items_annotation_idx on public.collection_items (annotation_id);

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

create policy collections_select on public.collections for select
  using (visibility in ('public','unlisted') or user_id = auth.uid());
create policy collections_insert on public.collections for insert
  with check (user_id = auth.uid());
create policy collections_update on public.collections for update
  using (user_id = auth.uid());
create policy collections_delete on public.collections for delete
  using (user_id = auth.uid());

create policy collection_items_select on public.collection_items for select
  using (exists (select 1 from public.collections c where c.id = collection_id
                 and (c.visibility in ('public','unlisted') or c.user_id = auth.uid())));
create policy collection_items_write on public.collection_items for insert
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()));
create policy collection_items_delete on public.collection_items for delete
  using (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()));

alter table public.claims add column if not exists claim_type text not null default 'dispute'
  check (claim_type in ('dispute','verify'));

create table if not exists public.endorsements (
  annotation_id uuid primary key references public.annotations(id) on delete cascade,
  claimant_email text not null,
  display_name text,
  message text check (char_length(message) <= 500),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.endorsements enable row level security;
create policy endorsements_select on public.endorsements for select using (true);
create policy endorsements_insert on public.endorsements for insert with check (true);

create table if not exists public.license_interests (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid not null references public.annotations(id) on delete cascade,
  contact_email text not null,
  role text not null check (role in ('creator','licensee')),
  message text check (char_length(message) <= 1000),
  status text not null default 'open' check (status in ('open','contacted','closed')),
  created_at timestamptz not null default now()
);
alter table public.license_interests enable row level security;
create policy license_interests_insert on public.license_interests for insert with check (true);
create policy license_interests_select on public.license_interests for select
  using (exists (select 1 from public.annotations a where a.id = annotation_id and a.user_id = auth.uid()));
create index if not exists license_interests_annotation_idx on public.license_interests (annotation_id);
