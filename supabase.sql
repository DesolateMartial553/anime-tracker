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
