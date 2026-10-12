-- Tributes for the Josephine memorial page.
-- Run this once in Supabase: SQL Editor, paste, Run.
--
-- How it works:
--   * Anyone can send a tribute. It is saved with approved = false, so it is NOT shown.
--   * Only rows with approved = true are visible on the page.
--   * To approve a tribute: Supabase, Table Editor, memorial_tributes, tick the "approved" box on that row.
--   * To remove one: delete the row, or untick "approved".

create table if not exists public.memorial_tributes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  relationship text check (relationship is null or char_length(relationship) <= 80),
  message text not null check (char_length(message) between 1 and 1000),
  approved boolean not null default false
);

alter table public.memorial_tributes enable row level security;

drop policy if exists "anyone can read approved tributes" on public.memorial_tributes;
create policy "anyone can read approved tributes"
  on public.memorial_tributes for select
  to anon, authenticated
  using (approved = true);

drop policy if exists "anyone can leave a tribute for review" on public.memorial_tributes;
create policy "anyone can leave a tribute for review"
  on public.memorial_tributes for insert
  to anon, authenticated
  with check (approved = false);

-- Flood guard: no more than 40 new tributes in any one hour.
create or replace function public.limit_tribute_flood()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.memorial_tributes where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Too many tributes right now. Please try again later.';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_tribute_flood on public.memorial_tributes;
create trigger limit_tribute_flood
  before insert on public.memorial_tributes
  for each row execute function public.limit_tribute_flood();
