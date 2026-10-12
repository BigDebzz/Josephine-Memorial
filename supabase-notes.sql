-- Yearly remembrance notes for the Josephine memorial page.
-- Run once in Supabase: SQL Editor, paste, Run.
--
-- To add a note each year (no code needed):
--   Supabase, Table Editor, memorial_notes, Insert row. Fill in year, an optional title, and the body.
--   Leave a blank line between paragraphs in the body.
-- The newest year is shown first. The section stays hidden until the first note exists.

create table if not exists public.memorial_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  year int not null check (year between 2024 and 2100),
  title text check (title is null or char_length(title) <= 120),
  body text not null check (char_length(body) between 1 and 4000)
);

alter table public.memorial_notes enable row level security;

-- visitors can read the notes; only you, from the dashboard, can add or change them
drop policy if exists "anyone can read remembrance notes" on public.memorial_notes;
create policy "anyone can read remembrance notes"
  on public.memorial_notes for select
  to anon, authenticated
  using (true);
