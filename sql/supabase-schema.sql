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

/* Supabase grants every new public table ALL PRIVILEGES to anon and authenticated by
   default, and RLS only gates SELECT/INSERT/UPDATE/DELETE — TRUNCATE is answered by the
   privilege alone, with no policy in the way. So the grants themselves are trimmed to
   exactly what each role does, and a signed-in client is left with read and write of
   its own rows and nothing else. */
revoke all on table public.requests from anon;
revoke truncate, update, delete, references, trigger on table public.requests from authenticated;
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

/* A transcript, shape-checked rather than merely length-checked: the id the page mints,
   a path on this site, a two-letter language, and the sizes the page itself caps at.
   A stranger holding the publishable key can still file a row — that is the design —
   but not one that is not in the form the page writes. */
drop policy if exists "chat transcripts are write only" on public.chat_logs;
create policy "chat transcripts are write only"
  on public.chat_logs for insert
  to anon
  with check (
    visitor_id ~ '^[A-Za-z0-9_-]{8,40}$'
    and length(question) between 1 and 500
    and length(answer) <= 2000
    and (page = '' or page ~ '^/[A-Za-z0-9._/-]{0,199}$')
    and lang ~ '^[A-Za-z][A-Za-z-]{1,7}$'
  );

-- insert only, to anon only: the key a visitor's browser holds can file a row and
-- cannot select, update, delete or empty the table.
revoke all on table public.chat_logs from anon, authenticated;
grant insert on table public.chat_logs to anon;

-- ---------------------------------------------------------------------------
-- Bounded writes: the one thing a shape check cannot do is limit *how many* rows
-- arrive, and an anonymous write endpoint that no one throttles is a slow-motion
-- way to fill a free-tier database. The counter below is the throttle.
--
-- It cannot live in the policy: a policy that counted recent rows would run as anon,
-- which has no SELECT policy on this table, so it would always see zero and always
-- pass. It lives in a trigger instead, and the trigger function is SECURITY DEFINER,
-- so its own read of the counter runs as the table owner and sees the real number.
--
-- A refused insert aborts its whole statement, including the increment it just made,
-- which is why the counter sits at the cap rather than running away past it: the limit
-- is a wall, not a speed bump. Proved on 2026-10-31 by setting the counter to the cap
-- and putting a real row at it — 400 "chat archive is at its daily limit", and the
-- counter had not moved.

create table if not exists public.rate_counters (
  key        text primary key,
  day        date not null default current_date,
  today      integer not null default 0,
  total      integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.rate_counters enable row level security;
revoke all on table public.rate_counters from anon, authenticated;

-- One atomic step: take a credit, tell the caller whether it is inside the cap.
-- The upsert is the locking; two concurrent writers cannot both read the old number.
create or replace function public.rate_take(p_key text, p_daily integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; tot int;
begin
  insert into public.rate_counters (key, day, today, total, updated_at)
  values (p_key, current_date, 1, 1, now())
  on conflict (key) do update
     set today = case when public.rate_counters.day = current_date
                      then public.rate_counters.today + 1 else 1 end,
         day = current_date,
         total = public.rate_counters.total + 1,
         updated_at = now()
  returning today, total into n, tot;
  return jsonb_build_object('ok', n <= p_daily, 'today', n, 'total', tot);
end $$;

create or replace function public.chat_log_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare used jsonb;
begin
  used := public.rate_take('chat_rows', 1000);
  if (used ->> 'today')::int > 1000 then raise exception 'chat archive is at its daily limit'; end if;
  if (used ->> 'total')::int > 20000 then raise exception 'chat archive is full'; end if;
  return new;
end $$;

-- Neither function is callable from the site: the trigger runs as the owner, and an
-- Edge Function that holds the service key is the only outside caller rate_take has.
revoke all on function public.rate_take(text, integer) from public, anon, authenticated;
revoke all on function public.chat_log_capacity() from public, anon, authenticated;
grant execute on function public.rate_take(text, integer) to service_role;

drop trigger if exists chat_log_capacity on public.chat_logs;
create trigger chat_log_capacity before insert on public.chat_logs
  for each statement execute function public.chat_log_capacity();

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
-- posts every charge straight to the paystack-webhook Edge Function, which files one
-- row here and records in signature_status whether the HMAC-SHA512 proof held. A
-- delivery it cannot verify is still filed — discarding it is what left two real
-- charges with no trace at all. Nothing on the site reads it, which is why there are
-- no policies: the only writer is the function, holding the service role key that
-- bypasses row level security anyway.
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
  received_at timestamptz not null default now(),
  -- 'ok' when the HMAC matched our live secret, 'stale' when Paystack signed a real
  -- delivery against a key we no longer hold. The default is the untrusted value, so
  -- a row can only read as verified if the function went and proved it.
  signature_status text not null default 'stale'
);

-- Added 2026-11-09. Kept as a separate statement so an existing table picks it up
-- too: the webhook began filing unverifiable deliveries instead of discarding them,
-- which is the difference between a dead signing key and a dead month of payments.
alter table public.payments
  add column if not exists signature_status text not null default 'stale';

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

-- ---------------------------------------------------------------------------
-- The ratings and notes left on the help page. A row here is not a person asking
-- to be reached the way a lead is: it is a tap that said whether an answer
-- worked, an optional sentence, and a number only if the visitor typed one
-- because they want a reply. Built the same way as the two above — RLS enabled,
-- every grant to a browser key revoked, and deliberately no policy — so the only
-- writer in the world is the studio's own service key inside /capture, and a bot
-- that finds the endpoint has no way into the table.
-- ---------------------------------------------------------------------------

create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  topic      text not null default 'other'
             constraint feedback_topic_check
             check (topic in ('answer', 'page', 'other')),
  vote       text not null default ''
             constraint feedback_vote_check
             check (vote in ('', 'yes', 'no')),
  article    text not null default 'help',
  message    text not null default '',
  contact    text not null default '',
  page       text not null default '',
  lang       text not null default 'en'
);

create index if not exists feedback_created_idx
  on public.feedback (created_at desc);
create index if not exists feedback_topic_idx
  on public.feedback (topic, vote, created_at desc);

alter table public.feedback enable row level security;
revoke all on table public.feedback from anon, authenticated;

-- Proof both are closed to a browser key: each count must come back zero.
select (select count(*) from pg_policies where tablename = 'leads')  as lead_policies,
       (select count(*) from pg_policies where tablename = 'visits') as visit_policies,
       (select count(*) from pg_policies where tablename = 'feedback') as feedback_policies;

-- The owner's reading query, when he wants the list rather than the table editor:
--   select to_char(created_at,'YYYY-MM-DD HH24:MI') as when, name, whatsapp,
--          interest, lang, status
--     from public.leads order by id desc limit 100;
--   select day, count(*) as page_views, count(distinct visitor) as people
--     from public.visits group by day order by day desc limit 30;


-- ============================================================================
-- chat_threads — carrying one conversation to another device (added 2026-11-19)
--
-- A visitor's thread lives in that browser's localStorage, and localStorage does
-- not cross a device: the same person on a phone is a stranger to the assistant.
-- This table is the second copy. It is keyed by a code the visitor's own browser
-- mints and shows only to them, which makes the code the whole of the proof of who
-- is asking — so carrying a chat involves no name, no email, no phone number and no
-- sign-in, and nothing at all is filed unless the visitor presses the chip that
-- takes a code out.
--
-- Deliberately NOT policy-driven, which is the opposite of chat_logs above. A policy
-- can only open a table to a role, and any role that can select can select every row
-- in it: the code would then be a password the client checks for the server, which is
-- not a check at all. So anon keeps no privilege on the table whatever, and the two
-- functions below are the only doors. Each takes the code as an argument, runs as the
-- owner, and reads or writes the one row keyed by it. The archive in chat_logs is
-- untouched and is still write-only: what these functions return goes to the browser
-- that proved the code, and to nowhere else.
--
-- Two shapes are checked here as well as in the page, because a stranger holding the
-- publishable key can call these functions all day: the code's alphabet and length,
-- and each turn's role and size. Growth is bounded three ways — 24 turns per thread,
-- 30 days of life swept on each new thread, and rate_take credits for calls a day.
-- ============================================================================

create table if not exists public.chat_threads (
  code        text primary key,
  turns       jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint chat_threads_code_form
    check (char_length(code) = 16 and code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$'),
  constraint chat_threads_turns_shape
    check (jsonb_typeof(turns) = 'array' and jsonb_array_length(turns) between 0 and 24)
);

alter table public.chat_threads enable row level security;

-- No policy is created on this table, on purpose: see the note above. With row level
-- security on and no policies, a role reaching the table directly would read nothing
-- even if a grant were ever handed out by mistake — the grant below is what makes it
-- not reach the table at all.
revoke all on table public.chat_threads from anon, authenticated;

-- The visitor's browser writes their own thread: the code, then the turns as the page
-- keeps them. Anything the page would not mint for itself is refused before the table
-- sees it.
create or replace function public.chat_thread_save(p_code text, p_turns jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare credit jsonb; live int;
begin
  if p_code is null or char_length(p_code) <> 16
     or p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$' then
    raise exception 'a chat code is sixteen of the signs this site mints, and nothing else';
  end if;
  if p_turns is null or jsonb_typeof(p_turns) <> 'array'
     or jsonb_array_length(p_turns) > 24 then
    raise exception 'a carried chat is at most twenty-four turns';
  end if;
  if exists (select 1 from jsonb_array_elements(p_turns) as e
               where coalesce(e ->> 'role', '') not in ('user', 'model')
                  or coalesce(length(e ->> 'text'), 0) < 1
                  or length(e ->> 'text') > 400) then
    raise exception 'a carried turn is a role and a sentence';
  end if;

  credit := public.rate_take('thread_saves', 300);
  if (credit ->> 'today')::int > 300 then raise exception 'chat carry-over is at its daily limit'; end if;

  -- A thread only costs storage while someone still holds its code, so the sweep runs
  -- where the growth does: on the arrival of a new one, not on a job that may not exist.
  if not exists (select 1 from public.chat_threads where code = p_code) then
    delete from public.chat_threads where updated_at < now() - interval '30 days';
    live := (select count(*) from public.chat_threads);
    if live > 5000 then raise exception 'chat carry-over is full'; end if;
  end if;

  insert into public.chat_threads (code, turns, updated_at)
  values (p_code, p_turns, now())
  on conflict (code) do update set turns = excluded.turns, updated_at = now();
end $$;

-- The other direction, and the only place a thread is ever read out of the database by
-- a browser key: the caller has to say the code, and gets back the turns and nothing
-- else from the row. Deliberately volatile, not stable: it pays for a rate credit, and
-- PostgREST runs a stable function in a read-only transaction, where that insert dies.
create or replace function public.chat_thread_load(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare outcome jsonb; credit jsonb;
begin
  if p_code is null or char_length(p_code) <> 16
     or p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$' then
    return '[]'::jsonb;
  end if;

  credit := public.rate_take('thread_loads', 600);
  if (credit ->> 'today')::int > 600 then raise exception 'chat carry-over is at its daily limit'; end if;

  select jsonb_build_object('turns', turns, 'at', extract(epoch from updated_at)) into outcome
    from public.chat_threads
   where chat_threads.code = p_code and updated_at > now() - interval '30 days';
  return outcome;
end $$;

-- Both are callable by the key every visitor's browser already holds, and neither
-- grants a way past the code it asks for. An empty or wrong code answers with nothing,
-- not with an error, so a mistyped code costs a visitor one retry rather than a stack.
revoke all on function public.chat_thread_save(text, jsonb) from public, anon, authenticated;
revoke all on function public.chat_thread_load(text) from public, anon, authenticated;
grant execute on function public.chat_thread_save(text, jsonb) to anon;
grant execute on function public.chat_thread_load(text) to anon;

-- Proof it is shut the way it was meant to be: the first two counts must be zero (no
-- policies on this table) and the third must be that the key cannot read the table.
select (select count(*) from pg_policies where tablename = 'chat_threads') as thread_policies,
       (select has_table_privilege('anon', 'public.chat_threads', 'select')) as anon_can_select,
       (select has_function_privilege('anon', 'public.chat_thread_load(text)', 'execute')) as anon_can_load;
