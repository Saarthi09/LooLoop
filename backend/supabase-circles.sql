create table if not exists public.event_circles (
    id uuid primary key default gen_random_uuid(),
    event_id text not null unique,
    event_name text not null,
    event_url text,
    event_date timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.event_circle_members (
    circle_id uuid not null references public.event_circles(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    username text not null,
    instagram_handle text,
    joined_at timestamptz not null default now(),
    primary key (circle_id, user_id)
);

alter table public.event_circles enable row level security;
alter table public.event_circle_members enable row level security;

alter table public.event_circle_members
    add column if not exists instagram_handle text;

-- Express uses the Supabase secret key and verifies every access token.
-- The browser does not query Supabase directly, so public policies are unnecessary.
