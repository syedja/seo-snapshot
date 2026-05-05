-- ─────────────────────────────────────────
-- SEO Snapshot — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ─────────────────────────────────────────

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── LEADS TABLE ──
create table if not exists leads (
  id                uuid primary key default uuid_generate_v4(),
  email             text not null,
  domain            text not null,
  url               text not null,
  stripe_session_id text unique,
  paid              boolean default false,
  paid_at           timestamptz,
  score             integer,
  report_json       jsonb,
  report_sent       boolean default false,
  report_sent_at    timestamptz,
  created_at        timestamptz default now()
);

-- Indexes for common queries
create index if not exists leads_email_idx on leads(email);
create index if not exists leads_stripe_session_idx on leads(stripe_session_id);
create index if not exists leads_created_at_idx on leads(created_at desc);

-- ── ROW LEVEL SECURITY ──
-- Enable RLS (your server uses the service_role key which bypasses RLS)
alter table leads enable row level security;

-- No public access — only service_role key (used server-side) can read/write
-- This means the anon key cannot access this table at all
create policy "No public access" on leads
  for all
  to anon
  using (false);
