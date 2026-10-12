-- Yearly remembrance messages: let people write them on the page, with approval first.
-- Run once in Supabase: SQL Editor, paste, Run. (Safe to run again.)
--
-- After this:
--   * Anyone can write a message on the Yearly remembrance messages page. It is saved with approved = false.
--   * Only approved messages are shown, grouped by year, newest year first.
--   * To approve one: Table Editor, memorial_notes, change the approved cell to TRUE.
--   * A message you add yourself in the Table Editor is approved straight away.

alter table public.memorial_notes
  add column if not exists author text check (author is null or char_length(author) <= 80);
alter table public.memorial_notes
  add column if not exists relationship text check (relationship is null or char_length(relationship) <= 80);
alter table public.memorial_notes
  add column if not exists approved boolean not null default true;
alter table public.memorial_notes
  add column if not exists written_on date;

alter table public.memorial_notes enable row level security;

drop policy if exists "anyone can read remembrance notes" on public.memorial_notes;
drop policy if exists "anyone can read approved remembrance notes" on public.memorial_notes;
create policy "anyone can read approved remembrance notes"
  on public.memorial_notes for select
  to anon, authenticated
  using (approved = true);

drop policy if exists "anyone can send a remembrance message for review" on public.memorial_notes;
create policy "anyone can send a remembrance message for review"
  on public.memorial_notes for insert
  to anon, authenticated
  with check (approved = false);

-- Flood guard: no more than 40 new messages in any one hour.
create or replace function public.limit_note_flood()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.memorial_notes where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Too many messages right now. Please try again later.';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_note_flood on public.memorial_notes;
create trigger limit_note_flood
  before insert on public.memorial_notes
  for each row execute function public.limit_note_flood();
