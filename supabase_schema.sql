-- Econometrics Lab — Supabase Postgres schema + Row Level Security
-- Already applied to the live project (wigbswaeitfedfwgnvap) via the
-- Supabase MCP. Kept here as the source of truth / for standing up a new
-- environment from scratch.
--
-- Design: each Firestore subcollection under users/{uid}/... becomes a table
-- with a user_id column (auth.uid()) instead of a path segment. Free-form
-- payloads (results, coefficients, etc.) are stored as JSONB, matching
-- Firestore's schemaless documents, rather than forcing every field into a
-- strict relational column.
--
-- RLS policies wrap auth.uid() as (select auth.uid()) throughout -- same
-- security semantics, but the planner evaluates it once per query instead
-- of once per row (flagged by Supabase's performance advisor and fixed
-- after the initial migration).

-- ── workspace (was users/{uid}/workspace/current, a single doc) ───────────
create table if not exists workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table workspaces enable row level security;

create policy "workspaces_select_own" on workspaces
  for select using ((select auth.uid()) = user_id);

create policy "workspaces_upsert_own" on workspaces
  for insert with check ((select auth.uid()) = user_id);

create policy "workspaces_update_own" on workspaces
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── model runs (was users/{uid}/modelRuns/{runId}) ─────────────────────────
create table if not exists model_runs (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table model_runs enable row level security;

create policy "model_runs_select_own" on model_runs
  for select using ((select auth.uid()) = user_id);

create policy "model_runs_insert_own" on model_runs
  for insert with check ((select auth.uid()) = user_id);

create policy "model_runs_update_own" on model_runs
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "model_runs_delete_own" on model_runs
  for delete using ((select auth.uid()) = user_id);

-- ── robustness vault items (was users/{uid}/robustness/{specId}) ──────────
create table if not exists robustness_items (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table robustness_items enable row level security;

create policy "robustness_items_select_own" on robustness_items
  for select using ((select auth.uid()) = user_id);

create policy "robustness_items_insert_own" on robustness_items
  for insert with check ((select auth.uid()) = user_id);

create policy "robustness_items_delete_own" on robustness_items
  for delete using ((select auth.uid()) = user_id);

-- ── report drafts (was users/{uid}/reports/{reportId}) ─────────────────────
create table if not exists report_drafts (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table report_drafts enable row level security;

create policy "report_drafts_select_own" on report_drafts
  for select using ((select auth.uid()) = user_id);

create policy "report_drafts_insert_own" on report_drafts
  for insert with check ((select auth.uid()) = user_id);

create policy "report_drafts_update_own" on report_drafts
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "report_drafts_delete_own" on report_drafts
  for delete using ((select auth.uid()) = user_id);

-- ── pinned results (was users/{uid}/pinnedResults/{pinnedId}) ──────────────
create table if not exists pinned_results (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table pinned_results enable row level security;

create policy "pinned_results_select_own" on pinned_results
  for select using ((select auth.uid()) = user_id);

create policy "pinned_results_insert_own" on pinned_results
  for insert with check ((select auth.uid()) = user_id);

create policy "pinned_results_update_own" on pinned_results
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "pinned_results_delete_own" on pinned_results
  for delete using ((select auth.uid()) = user_id);

-- ── pipeline notes (was top-level pipelineNotes/{noteId}, not user-scoped
--    by path -- ownership is enforced via an authorUid field instead,
--    matching the original firestore.rules exactly: read/update/delete
--    require existing.authorUid == auth.uid(), any signed-in user can
--    create with a matching authorUid) ───────────────────────────────────
create table if not exists pipeline_notes (
  id text primary key,
  stage_id text not null check (stage_id in ('ideation', 'data-cleaning', 'regression', 'manuscript')),
  content text not null check (char_length(content) <= 2000),
  author_name text not null check (char_length(author_name) <= 128),
  author_uid uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table pipeline_notes enable row level security;

create policy "pipeline_notes_select_own" on pipeline_notes
  for select using ((select auth.uid()) = author_uid);

create policy "pipeline_notes_insert_own" on pipeline_notes
  for insert with check ((select auth.uid()) = author_uid);

create policy "pipeline_notes_update_own" on pipeline_notes
  for update using ((select auth.uid()) = author_uid) with check ((select auth.uid()) = author_uid);

create policy "pipeline_notes_delete_own" on pipeline_notes
  for delete using ((select auth.uid()) = author_uid);

create index if not exists pipeline_notes_author_uid_idx on pipeline_notes(author_uid);

-- ── Enable anonymous sign-ins (guest mode) ──────────────────────────────
-- Cannot be done via SQL/MCP -- Supabase Dashboard → Authentication →
-- Providers → Anonymous Sign-Ins → toggle on.
