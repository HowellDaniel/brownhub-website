-- BrownHub client request history — paste this whole file into the Supabase SQL editor and Run.
-- Clients can only ever read or write their own rows; nobody can read another client's enquiries.
-- gen_random_uuid() is built into Postgres 13+, so no extension is needed here.
-- Re-running the whole file is safe: every statement is if-not-exists or drop-then-create.

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

-- ---------------------------------------------------------------------------
-- Chat transcripts: everything visitors asked the robotic assistant, and how it
-- answered. Anonymous by design — a random id the assistant minted for that
-- browser, never a name, email, phone number, IP address or tracking cookie.
-- The browser may only write, so no visitor can read anyone else's conversation;
-- you read the archive in the dashboard (Table editor -> chat_logs).

create table if not exists public.chat_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  visitor_id  text not null,
  page        text not null default '',
  lang        text not null default 'en',
  question    text not null,
  answer      text not null default '',
  source      text not null default 'intent'
              constraint chat_logs_source_check
              check (source in ('intent', 'model', 'fallback'))
);

create index if not exists chat_logs_created_idx
  on public.chat_logs (created_at desc);

alter table public.chat_logs enable row level security;

-- Write a transcript, with the sizes the page itself already caps at.
drop policy if exists "chat transcripts are write only" on public.chat_logs;
create policy "chat transcripts are write only"
  on public.chat_logs for insert
  to anon
  with check (
    length(visitor_id) between 1 and 40
    and length(question) between 1 and 500
    and length(answer) <= 2000
    and length(page) <= 200
    and length(lang) <= 8
  );

-- insert only, to anon only: the key a visitor's browser holds can file a row and
-- cannot select, update or delete one.
revoke all on table public.chat_logs from anon;
grant insert on table public.chat_logs to anon;

-- Run this last to confirm it worked; it should print both tables with their policies.
select to_regclass('public.requests') AS requests,
       (select count(*) from pg_policies where tablename = 'requests') as request_policies,
       to_regclass('public.chat_logs') as chat_logs,
       (select count(*) from pg_policies where tablename = 'chat_logs') as chat_policies;
