-- =============================================================================
-- Free-tier keep-alive: a daily job that keeps the project active
-- Migration 0014_keep_alive_cron
--
-- Prevents the free-tier 7-day inactivity pause by making a real API request
-- (via pg_net) plus a heartbeat write, once a day (via pg_cron).
-- Not needed on paid plans (which never pause) — drop the cron job then:
--   select cron.unschedule('keep-alive-daily');
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.keep_alive (
  id         int primary key default 1,
  last_ping  timestamptz not null default now(),
  pings      bigint not null default 0
);
insert into public.keep_alive (id) values (1) on conflict (id) do nothing;
alter table public.keep_alive enable row level security;

create or replace function public.keep_alive_ping()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.keep_alive set last_ping = now(), pings = pings + 1 where id = 1;
  perform net.http_get(
    url := 'https://bistwpzpfrtlmsegoggu.supabase.co/rest/v1/keep_alive?select=id&limit=1',
    headers := jsonb_build_object('apikey', '<ANON_PUBLIC_KEY>')
  );
end $$;

select cron.schedule('keep-alive-daily', '30 3 * * *', $$select public.keep_alive_ping();$$);
