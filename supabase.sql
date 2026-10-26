-- Run once in Supabase → SQL Editor → New query → paste → Run.

create table if not exists public.entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  anilist_id   integer not null,
  title        text not null,
  title_native text,
  cover_url    text,
  cover_color  text,
  total_eps    integer,
  format       text,
  country      text,
  year         integer,
  status       text not null default 'planning'
               check (status in ('watching', 'planning', 'completed', 'paused', 'dropped')),
  progress     integer not null default 0 check (progress >= 0),
  score        integer not null default 0 check (score between 0 and 10),
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, anilist_id)
);

create index if not exists entries_user_updated on public.entries (user_id, updated_at desc);

alter table public.entries enable row level security;

create policy "read own entries"   on public.entries for select using (auth.uid() = user_id);
create policy "add own entries"    on public.entries for insert with check (auth.uid() = user_id);
create policy "edit own entries"   on public.entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "remove own entries" on public.entries for delete using (auth.uid() = user_id);

-- ============================================================
--  Couple sharing (paste this whole file — one run each time it changes)
--  Each person keeps their own shelf; a couple row lets your person
--  read your shows from Cozy Corner (and you theirs). Nobody writes
--  to anyone else's rows.
-- ============================================================

create table if not exists public.couples (
  a          uuid not null references auth.users (id) on delete cascade,
  b          uuid     references auth.users (id) on delete cascade,
  code       text not null unique default
             upper(substr(replace(replace(md5(random()::text), '/', ''), '+', ''), 1, 9)),
  created_at timestamptz not null default now(),
  primary key (a)
);

alter table public.couples enable row level security;

create policy "see own couple row" on public.couples for select
  using (a = auth.uid() or b = auth.uid() or b is null);

create policy "start an invite" on public.couples for insert
  with check (a = auth.uid() and b is null);

-- Everyone signed in may fill an open invite's empty seat (the code is the secret).
create policy "accept an invite" on public.couples for update
  using (b is null) with check (a = auth.uid() or b = auth.uid());

create policy "unpair" on public.couples for delete
  using (a = auth.uid() or b = auth.uid());

-- Entries: your person can read yours, still only you can change them.
create policy "partner can read" on public.entries for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.couples c
      where c.b is not null
        and (
          (c.a = auth.uid() and c.b = entries.user_id)
          or (c.b = auth.uid() and c.a = entries.user_id)
        )
    )
  );
