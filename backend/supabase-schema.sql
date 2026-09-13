-- Run this in Supabase: SQL Editor > New query.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null,
  tags text[] not null default '{}',
  capacity integer,
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "Anyone can view events" on public.events for select using (true);
create policy "Anyone can create events" on public.events for insert with check (true);
