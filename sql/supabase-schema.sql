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


-- ============================================================================
-- payments — what Paystack's liveWebhookUrl writes (added 2026-09-28)
--
-- The site's own checkout only knows a payment happened if the buyer's browser is
-- still open when Paystack closes its frame. This table is the other half: Paystack
-- posts every charge straight to the paystack-webhook Edge Function, which verifies
-- the HMAC-SHA512 signature and files one row here. Nothing on the site reads it,
-- which is why there are no policies: the only writer is the function, holding the
-- service role key that bypasses row level security anyway.
--
-- Run through the dashboard query API (SQL editor) or:
--   curl -X POST -H "Authorization: Bearer $(cat /tmp/bh_tok)" \
--     -H "Content-Type: application/json" --data-binary @body.json \
--     https://api.supabase.com/v1/projects/rmvyrfqyxgupwuzxadyx/database/query
-- ============================================================================

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  reference text not null,
  event text not null,
  amount_kobo bigint,
  currency text,
  channel text,
  status text,
  customer_email text,
  item text,
  paid_at timestamptz,
  received_at timestamptz not null default now()
);

-- Paystack redelivers an event it did not like the answer to; this key is what the
-- function's on_conflict=reference,event upsert leans on, so a retry files once.
create unique index if not exists payments_reference_event_key
  on public.payments (reference, event);

alter table public.payments enable row level security;
revoke all on table public.payments from anon, authenticated;

-- Proof it is closed: this must return both counts as zero.
select (select count(*) from pg_policies where tablename = 'payments') as payments_policies;


-- ============================================================================
-- leads + visits — the studio's own record of who asked for a quote, and of how
-- many people read a page (added 2026-10-04, asked for as "keep record of anyone
-- who opens the website").
--
-- Neither table has an insert policy, and that is the point: the publishable key
-- sits in a public repo, so a policy for anon would let anyone file thousands of
-- fake leads or fake page views a minute. The only writer is the capture Edge
-- Function (supabase/functions/capture), which holds the service role key and
-- checks the request's Origin, its size and the caller's address before anything
-- reaches these rows. The studio reads them in the dashboard's Table editor,
-- which uses the same service role and is not affected by row level security.
--
-- Nothing here identifies a stranger. visits.visitor is sha256(TRACK_SALT|ip|day),
-- so the same person counts once per day and the address itself is never kept —
-- it cannot be recovered from the hash without the salt, which lives only in
-- Supabase's secret store. leads holds what a person typed on purpose, so they
-- can be replied to, and nothing else.
-- ============================================================================

create table if not exists public.leads (
  id                 bigint generated always as identity primary key,
  created_at         timestamptz not null default now(),
  name               text not null,
  whatsapp           text not null,
  whatsapp_as_typed  text not null default '',
  interest           text not null default '',
  page               text not null default '',
  lang               text not null default 'en',
  referrer           text not null default '',
  status             text not null default 'new'
                     constraint leads_status_check
                     check (status in ('new', 'contacted', 'quoted', 'closed', 'spam'))
);

create index if not exists leads_created_idx
  on public.leads (created_at desc);
create index if not exists leads_status_idx
  on public.leads (status, created_at desc);

alter table public.leads enable row level security;
revoke all on table public.leads from anon, authenticated;

create table if not exists public.visits (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  day        date not null default (now() at time zone 'utc')::date,
  page       text not null default '/',
  lang       text not null default 'en',
  referrer   text not null default '',
  device     text not null default 'unknown'
             constraint visits_device_check
             check (device in ('phone', 'tablet', 'desktop', 'unknown')),
  visitor    text not null default ''
);

create index if not exists visits_day_idx
  on public.visits (day desc, page);
create index if not exists visits_created_idx
  on public.visits (created_at desc);

alter table public.visits enable row level security;
revoke all on table public.visits from anon, authenticated;

-- Proof both are closed to a browser key: each count must come back zero.
select (select count(*) from pg_policies where tablename = 'leads')  as lead_policies,
       (select count(*) from pg_policies where tablename = 'visits') as visit_policies;

-- The owner's reading query, when he wants the list rather than the table editor:
--   select to_char(created_at,'YYYY-MM-DD HH24:MI') as when, name, whatsapp,
--          interest, lang, status
--     from public.leads order by id desc limit 100;
--   select day, count(*) as page_views, count(distinct visitor) as people
--     from public.visits group by day order by day desc limit 30;
