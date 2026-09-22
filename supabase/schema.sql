-- ZMM Sponsor Command — database schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- The four areas a brand can be in.
--   new_submission    Brand reached out. Nobody here has replied yet, ever.
--   needs_reply       Live conversation, they sent last. Ball is in our court.
--   awaiting_feedback We sent last (proposal, deck, pricing). Waiting on them.
--   active_campaign   Deal is signed and the campaign is running.
-- ---------------------------------------------------------------------------
do $$ begin
  create type brand_stage as enum (
    'new_submission',
    'needs_reply',
    'awaiting_feedback',
    'active_campaign'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_direction as enum ('inbound', 'outbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type stage_source as enum ('auto', 'manual');
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------------
-- Who is allowed in. Seeded from ALLOWED_EMAILS on first boot, editable here.
-- ---------------------------------------------------------------------------
create table if not exists team_members (
  email       text primary key,
  name        text,
  role        text not null default 'member',
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- The connected inbox. One row per Gmail account being scanned.
-- refresh_token is a live credential: only the service role ever reads it.
-- ---------------------------------------------------------------------------
create table if not exists gmail_accounts (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  refresh_token  text not null,
  connected_by   text,
  connected_at   timestamptz not null default now(),
  last_scan_at   timestamptz,
  last_window_at timestamptz,        -- newest message timestamp we have ingested
  active         boolean not null default true
);


-- ---------------------------------------------------------------------------
-- Brands. One row per company, not per email thread — a brand that emails from
-- three addresses at the same company is still one card on the board.
-- ---------------------------------------------------------------------------
create table if not exists brands (
  id                    uuid primary key default gen_random_uuid(),

  -- Grouping key: the sender's domain for corporate senders, or the full email
  -- address when the domain is a free provider (gmail.com, etc.).
  group_key             text not null unique,
  name                  text not null,
  domain                text,
  website               text,

  primary_contact_name  text,
  primary_contact_email text,

  -- What the board shows.
  stage                 brand_stage not null default 'new_submission',
  -- 'manual' means a human set it; the hourly scan will not overwrite it.
  stage_source          stage_source not null default 'auto',
  -- What the email state says right now, even when a human has overridden it.
  auto_stage            brand_stage,
  stage_changed_at      timestamptz not null default now(),
  stage_changed_by      text,

  owner_email           text,

  -- Email-derived facts, refreshed every scan.
  first_contact_at      timestamptz,
  last_message_at       timestamptz,
  last_inbound_at       timestamptz,
  last_outbound_at      timestamptz,
  last_direction        message_direction,
  -- True whenever their message is the most recent one, at any stage. An
  -- active campaign with an unanswered email still needs to shout.
  awaiting_our_reply    boolean not null default false,
  thread_count          integer not null default 0,
  message_count         integer not null default 0,

  -- Triage state. 'unverified' shows a confirm/dismiss prompt on the card.
  classification        text not null default 'unverified'
                        check (classification in ('brand', 'unverified', 'dismissed')),
  confidence            real,
  summary               text,

  -- Deal detail the team fills in.
  deal_value            numeric,
  event_tag             text,
  notes                 text,

  blocked               boolean not null default false,
  archived              boolean not null default false,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- How the brand got here: a website submission, or entered by hand because it
-- came in off-website. Added after the first live run.
alter table brands add column if not exists source text not null default 'form'
  check (source in ('form', 'manual'));

-- Proposals, decks and contracts pinned to the brand.
alter table brands add column if not exists documents jsonb not null default '[]'::jsonb;

create index if not exists brands_stage_idx        on brands (stage) where archived = false;
create index if not exists brands_owner_idx        on brands (owner_email);
create index if not exists brands_last_message_idx on brands (last_message_at desc);


-- ---------------------------------------------------------------------------
-- Gmail threads, one row each, linked to the brand they belong to.
-- ---------------------------------------------------------------------------
create table if not exists threads (
  id              text primary key,            -- Gmail thread id
  brand_id        uuid not null references brands (id) on delete cascade,
  subject         text,
  snippet         text,
  message_count   integer not null default 0,
  first_message_at timestamptz,
  last_message_at timestamptz,
  last_direction  message_direction,
  updated_at      timestamptz not null default now()
);

create index if not exists threads_brand_idx on threads (brand_id, last_message_at desc);


-- ---------------------------------------------------------------------------
-- Individual messages — this is the timeline on a brand's detail page.
-- Subjects and snippets only; we never store full message bodies.
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id          text primary key,                -- Gmail message id
  thread_id   text not null references threads (id) on delete cascade,
  brand_id    uuid not null references brands (id) on delete cascade,
  direction   message_direction not null,
  -- An outbound message that went only to our own people: forwarding a lead
  -- to a partner for a second opinion. Kept for the timeline, but it never
  -- counts as having answered the brand — otherwise a forward reads as a
  -- reply and a lead nobody has responded to lands under "waiting on them".
  internal    boolean not null default false,
  from_email  text,
  from_name   text,
  to_emails   text[],
  cc_emails   text[],
  subject     text,
  snippet     text,
  sent_at     timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Added after the first run against a live inbox; safe on a fresh database.
alter table messages add column if not exists internal  boolean not null default false;
alter table messages add column if not exists cc_emails text[];

create index if not exists messages_brand_idx  on messages (brand_id, sent_at desc);
create index if not exists messages_thread_idx on messages (thread_id, sent_at asc);


-- ---------------------------------------------------------------------------
-- Every stage move, by the scan or by a person. This is the audit trail that
-- answers "who moved Polymarket to Active, and when".
-- ---------------------------------------------------------------------------
create table if not exists stage_events (
  id          bigserial primary key,
  brand_id    uuid not null references brands (id) on delete cascade,
  from_stage  brand_stage,
  to_stage    brand_stage not null,
  source      stage_source not null,
  actor       text,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists stage_events_brand_idx on stage_events (brand_id, created_at desc);


-- ---------------------------------------------------------------------------
-- Senders the team has dismissed as not-a-brand. The scan never resurfaces
-- these, so the board stops filling with the same newsletters every hour.
-- ---------------------------------------------------------------------------
create table if not exists ignored_senders (
  pattern     text primary key,                -- a domain ("substack.com") or a full address
  reason      text,
  added_by    text,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- Entities we are contractually or strategically barred from contacting.
-- A match here is flagged loudly and never auto-created onto the board.
-- ---------------------------------------------------------------------------
create table if not exists blocked_entities (
  pattern     text primary key,
  reason      text,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- One row per scan. Doubles as the overlap lock: a run stays 'running' until
-- it finishes, and the next trigger refuses to start on top of it.
-- ---------------------------------------------------------------------------
create table if not exists scan_runs (
  id              bigserial primary key,
  trigger         text not null check (trigger in ('cron', 'manual', 'backfill')),
  status          text not null default 'running'
                  check (status in ('running', 'ok', 'error')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  window_start    timestamptz,
  threads_seen    integer not null default 0,
  messages_seen   integer not null default 0,
  brands_created  integer not null default 0,
  brands_updated  integer not null default 0,
  stages_changed  integer not null default 0,
  skipped         integer not null default 0,
  error           text
);

alter table scan_runs add column if not exists ambassadors_created integer not null default 0;

create index if not exists scan_runs_started_idx on scan_runs (started_at desc);


-- ---------------------------------------------------------------------------
-- Recompute the email-derived columns on a set of brands from the messages
-- table, which is the source of truth.
--
-- This must stay in step with `deriveBrandFacts` in src/lib/stages.ts, which
-- is the same reduction in TypeScript and is what the tests pin down. If you
-- change one, change the other.
--
-- The hourly scan only sees a recent slice of the inbox, so a brand's real
-- state has to be re-derived from everything on record rather than from the
-- handful of messages that happened to arrive this hour. Doing it in one
-- statement keeps a 300-brand backfill to a single round trip.
-- ---------------------------------------------------------------------------
create or replace function refresh_brand_facts(ids uuid[])
returns void
language sql
as $$
  update brands b set
    first_contact_at   = m.first_at,
    last_message_at    = m.last_at,
    last_inbound_at    = m.last_in,
    last_outbound_at   = m.last_out,
    last_direction     = m.last_dir,
    awaiting_our_reply = (m.last_dir = 'inbound'),
    message_count      = m.total,
    thread_count       = m.threads,
    updated_at         = now()
  from (
    select
      brand_id,
      min(sent_at)                                              as first_at,
      max(sent_at)                                              as last_at,
      max(sent_at) filter (where direction = 'inbound')         as last_in,
      max(sent_at) filter (where direction = 'outbound')        as last_out,
      (array_agg(direction order by sent_at desc, id desc))[1]  as last_dir,
      count(*)                                                  as total,
      count(distinct thread_id)                                 as threads
    from messages
    where brand_id = any(ids)
      -- Internal forwards are not replies. Counting them here is what puts an
      -- unanswered lead in "Awaiting Feedback".
      and internal = false
    group by brand_id
  ) m
  where b.id = m.brand_id;
$$;


-- ---------------------------------------------------------------------------
-- Ambassadors.
--
-- Students applying to work campus, through the same website form that sends
-- brand inquiries and told apart by the subject. They are kept in their own
-- table rather than on the pipeline board on purpose: an applicant is not a
-- lead, and mixing them makes a sponsorship board unreadable.
-- ---------------------------------------------------------------------------
do $$ begin
  create type ambassador_stage as enum ('applied', 'reviewing', 'onboarded', 'active');
exception when duplicate_object then null; end $$;

create table if not exists ambassadors (
  id                uuid primary key default gen_random_uuid(),
  -- The application's Gmail message id. Unique, so re-reading the same window
  -- cannot create the same student twice.
  source_message_id text unique,

  stage             ambassador_stage not null default 'applied',
  stage_source      stage_source not null default 'auto',
  stage_changed_at  timestamptz not null default now(),
  stage_changed_by  text,

  full_name         text not null,
  school            text,
  school_email      text,
  phone             text,
  city              text,
  state             text,
  grad_year         text,
  major             text,
  dob               text,

  instagram         text,
  tiktok            text,
  ig_followers      integer,
  tt_followers      integer,
  niche             text,
  why               text,

  utm_source        text,
  landing_page      text,

  owner_email       text,
  notes             text,
  applied_at        timestamptz not null default now(),
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists ambassadors_stage_idx  on ambassadors (stage) where archived = false;
create index if not exists ambassadors_school_idx on ambassadors (school);
create index if not exists ambassadors_applied_idx on ambassadors (applied_at desc);

-- Who moved an applicant, and when. Recruiting decisions are all judgement
-- calls, so the trail of who made them is the whole audit story — there is no
-- email to reconstruct it from, the way there is for a brand.
create table if not exists ambassador_stage_events (
  id              bigserial primary key,
  ambassador_id   uuid not null references ambassadors (id) on delete cascade,
  from_stage      ambassador_stage,
  to_stage        ambassador_stage not null,
  actor           text,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists ambassador_stage_events_idx
  on ambassador_stage_events (ambassador_id, created_at desc);


-- ---------------------------------------------------------------------------
-- Row level security.
--
-- The browser never talks to Postgres directly — every read and write goes
-- through a Next.js server route that has already checked the signed-in user
-- against the allowlist. So we enable RLS and grant no policies at all:
-- anon and authenticated keys can read nothing, and the server's service-role
-- key bypasses RLS by design. If the public anon key ever leaks, it opens
-- nothing.
-- ---------------------------------------------------------------------------
alter table team_members     enable row level security;
alter table gmail_accounts   enable row level security;
alter table brands           enable row level security;
alter table threads          enable row level security;
alter table messages         enable row level security;
alter table stage_events     enable row level security;
alter table ambassador_stage_events enable row level security;
alter table ignored_senders  enable row level security;
alter table blocked_entities enable row level security;
alter table scan_runs        enable row level security;
alter table ambassadors      enable row level security;


-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------

-- Standing rule from the agency playbook: never contact Constellation Brands.
insert into blocked_entities (pattern, reason) values
  ('cbrands.com',            'Do not contact — standing agency rule'),
  ('constellationbrands.com','Do not contact — standing agency rule')
on conflict (pattern) do nothing;

-- Obvious non-brand senders, so the first scan does not dump 200 newsletters
-- onto the board. The team can add more from the dashboard.
insert into ignored_senders (pattern, reason, added_by) values
  ('google.com',        'Platform notifications', 'seed'),
  ('accounts.google.com','Platform notifications', 'seed'),
  ('docs.google.com',   'Platform notifications', 'seed'),
  ('calendar.google.com','Platform notifications', 'seed'),
  ('linkedin.com',      'Social notifications',    'seed'),
  ('slack.com',         'Platform notifications',  'seed'),
  ('notion.so',         'Platform notifications',  'seed'),
  ('docusign.net',      'E-signature notifications','seed'),
  ('calendly.com',      'Scheduling notifications','seed'),
  ('stripe.com',        'Billing',                 'seed'),
  ('intuit.com',        'Billing',                 'seed'),
  ('squareup.com',      'Billing',                 'seed'),
  ('github.com',        'Platform notifications',  'seed'),
  ('vercel.com',        'Platform notifications',  'seed'),
  ('substack.com',      'Newsletters',             'seed'),
  ('mailchimp.com',     'Newsletters',             'seed'),
  ('eventbrite.com',    'Newsletters',             'seed'),
  ('zoom.us',           'Platform notifications',  'seed')
on conflict (pattern) do nothing;
