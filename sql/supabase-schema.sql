-- BrownHub client request history — paste this whole file into the Supabase SQL editor and Run.
-- Clients can only ever read or write their own rows; nobody can read another client's enquiries.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  name        text,
  email       text,
  company     text,
  phone       text,
  service     text,
  budget      text,
  message     text not null,
  status      text not null default 'received'
              constraint requests_status_check
              check (status in ('received', 'quoted', 'in_production', 'delivered', 'closed'))
);

create index if not exists requests_user_created_idx
  on public.requests (user_id, created_at desc);

alter table public.requests enable row level security;

-- Read your own requests, newest first.
drop policy if exists "clients read own requests" on public.requests;
create policy "clients read own requests"
  on public.requests for select
  to authenticated
  using (auth.uid() = user_id);

-- File a request only under your own account.
drop policy if exists "clients insert own requests" on public.requests;
create policy "clients insert own requests"
  on public.requests for insert
  to authenticated
  with check (auth.uid() = user_id);

-- No UPDATE or DELETE policy on purpose: clients cannot edit or erase their history.
-- You change a client's status later from the Supabase dashboard (Table editor -> requests).

revoke all on table public.requests from anon;
grant select, insert on table public.requests to authenticated;
