-- ─────────────────────────────────────────────────────────────────────────────
-- core-general · intake + clients
-- Multi-tenant. Un proyecto = un tenant_id.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_net;
create extension if not exists pgcrypto;

-- ── INTAKE ────────────────────────────────────────────────────────────────────
-- Formulario entrante, raw, nunca se modifica tras el insert.
-- status: new → open → done

create table if not exists public.intake (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  tenant_id    text not null,                    -- slug del proyecto: "clinica-x"
  form_type    text not null default 'client',   -- "client", "patient", "lead"…
  status       text not null default 'new',      -- new | open | done
  -- Campos comunes
  name         text not null,
  email        text,
  phone        text,
  -- Payload libre para campos específicos por proyecto
  data         jsonb default '{}'::jsonb,
  -- Meta
  source       text,                             -- URL de origen
  user_agent   text
);

alter table public.intake enable row level security;
revoke all on public.intake from anon, authenticated;
grant insert on public.intake to anon;
grant select, update on public.intake to authenticated;

create policy "anon_insert_intake"
  on public.intake for insert to anon with check (true);

create policy "authenticated_manage_intake"
  on public.intake for all to authenticated using (true);

-- ── CLIENTS ───────────────────────────────────────────────────────────────────
-- Registro procesado y validado por el equipo.
-- Listo para ser consumido por otras apps.

create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  tenant_id    text not null,
  intake_id    uuid references public.intake(id),  -- origen
  -- Datos validados
  name         text not null,
  email        text,
  phone        text,
  -- Datos adicionales rellenados por el equipo
  data         jsonb default '{}'::jsonb,
  notes        text,
  status       text not null default 'active'       -- active | inactive | archived
);

alter table public.clients enable row level security;
revoke all on public.clients from anon, authenticated;
grant all on public.clients to authenticated;

create policy "authenticated_manage_clients"
  on public.clients for all to authenticated using (true);

-- ── TRIGGER updated_at ────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_updated_at
  before update on public.clients
  for each row execute procedure public.set_updated_at();

-- ── TRIGGER notify on intake insert ──────────────────────────────────────────
-- Llama a la Edge Function notify-intake por cada nuevo registro.
-- La URL base se configura por proyecto en la Edge Function.

create or replace function public.trigger_notify_intake()
returns trigger language plpgsql security definer as $func$
declare
  fn_url text;
begin
  fn_url := current_setting('app.supabase_url', true)
            || '/functions/v1/notify-intake';

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'type',      'INSERT',
      'table',     'intake',
      'record',    row_to_json(new),
      'tenant_id', new.tenant_id
    )
  );
  return new;
end;
$func$;

create trigger on_intake_insert
  after insert on public.intake
  for each row execute procedure public.trigger_notify_intake();
