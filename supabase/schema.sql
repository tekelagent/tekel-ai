-- ============================================================
-- Tekel Agent — Schema Supabase (Postgres)
--
-- ESTE ARCHIVO ES DOCUMENTACIÓN, NO SE EJECUTA.
--
-- Es la vista legible y completa del schema, útil para entender el
-- modelo de un vistazo. NO lo pegues en el SQL Editor y NO lo edites
-- esperando que cambie la base.
--
-- La fuente de verdad es supabase/migrations/. Para cambiar el schema:
--   1. supabase migration new <nombre>
--   2. escribe el ALTER/CREATE en el archivo generado
--   3. infisical run --env=dev -- supabase db push --yes
--   4. refleja el cambio aquí, para que esta vista siga al día
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ------------------------------------------------------------
-- CONTRACTS: una fila por contrato de SECOP II (jbjy-vk9h)
-- ------------------------------------------------------------
create table if not exists contracts (
  id                        uuid primary key default gen_random_uuid(),
  id_contrato               text unique not null,
  proceso_de_compra         text,
  referencia                text,
  nombre_entidad            text,
  nit_entidad               text,
  departamento              text,
  ciudad                    text,
  tipo_de_contrato          text,
  modalidad                 text,
  objeto                    text,
  estado_contrato           text,
  -- 'vigente' = plata en riesgo hoy | 'historico' = evidencia para control
  vigencia                  text not null default 'otro'
                            check (vigencia in ('vigente','historico','otro')),
  valor_contrato            numeric,
  valor_pagado              numeric,
  valor_facturado           numeric,
  valor_pendiente_ejecucion numeric,
  pago_adelantado           boolean,
  valor_pago_adelantado     numeric,
  dias_adicionados          integer,
  fecha_firma               date,
  fecha_inicio              date,
  fecha_fin                 date,
  documento_proveedor       text,   -- NIT/CC: llave para la capa forense (Croma)
  proveedor                 text,
  es_pyme                   boolean,
  representante_legal       text,
  representante_id          text,
  url_proceso               text,
  raw                       jsonb,  -- fila original completa: nada se pierde
  -- resultados del motor (se llenan en Pasos 2-3)
  risk_score                integer,
  risk_level                text check (risk_level in ('bajo','medio','critico')),
  resumen_riesgo            text,   -- 2 líneas generadas por Capa B
  -- triaje de METODOLOGIA §4
  prioridad                 text check (prioridad in ('P1','P2','P3')),
  plata_en_riesgo           numeric, -- vigentes: pendiente · históricos: pagado
  porque_ahora              jsonb,   -- razones en español compuestas desde los datos
  ingested_at               timestamptz not null default now(),
  enriched_at               timestamptz
);

create index if not exists idx_contracts_vigencia      on contracts (vigencia);
create index if not exists idx_contracts_departamento  on contracts (departamento);
create index if not exists idx_contracts_ciudad        on contracts (ciudad);
create index if not exists idx_contracts_tipo          on contracts (tipo_de_contrato);
create index if not exists idx_contracts_modalidad     on contracts (modalidad);
create index if not exists idx_contracts_fecha_firma   on contracts (fecha_firma);
create index if not exists idx_contracts_valor         on contracts (valor_contrato);
create index if not exists idx_contracts_proveedor_doc on contracts (documento_proveedor);
create index if not exists idx_contracts_risk          on contracts (risk_score desc nulls last);
create index if not exists idx_contracts_vig_depto     on contracts (vigencia, departamento);
-- búsqueda libre por objeto y proveedor (ilike rápido)
create index if not exists idx_contracts_objeto_trgm    on contracts using gin (objeto gin_trgm_ops);
create index if not exists idx_contracts_proveedor_trgm on contracts using gin (proveedor gin_trgm_ops);

-- ------------------------------------------------------------
-- FINDINGS: hallazgos por contrato (todas las capas escriben aquí)
-- ------------------------------------------------------------
create table if not exists findings (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references contracts(id) on delete cascade,
  pattern_code text not null,   -- p.ej. ADICIONES_50, PLIEGO_SASTRE (ver CLAUDE.md)
  severity     text not null check (severity in ('critica','alta','media')),
  points       integer not null,
  detail       text,            -- explicación en español para la UI
  evidence     jsonb,           -- cifras, citas textuales, página del PDF, payload Croma
  source       text not null check (source in ('rules','llm','croma')),
  -- calificación del hallazgo (METODOLOGIA §3)
  confianza    text check (confianza in ('alta','media','baja')),
  foco         text check (foco in ('entidad','contratista','ambos')),
  created_at   timestamptz not null default now(),
  unique (contract_id, pattern_code, source)  -- idempotente: re-correr no duplica
);

create index if not exists idx_findings_contract on findings (contract_id);
create index if not exists idx_findings_pattern  on findings (pattern_code);

-- ------------------------------------------------------------
-- DEEP_ANALYSES: caché de la Capa C (on-click del jurado)
-- ------------------------------------------------------------
create table if not exists deep_analyses (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null unique references contracts(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending','running','done','error')),
  model        text,
  forensic     jsonb,   -- respuestas Croma (RUES, antecedentes, contratos x proveedor)
  narrative    text,    -- consolidado en español generado por el LLM profundo
  pliego       jsonb,   -- hallazgos del PDF con citas y páginas (si hay pliego)
  cost_usd     numeric,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- INGEST_RUNS: trazabilidad de cada corrida de ingesta
-- ------------------------------------------------------------
create table if not exists ingest_runs (
  id            uuid primary key default gen_random_uuid(),
  dataset       text not null,
  params        jsonb,
  rows_fetched  integer default 0,
  rows_upserted integer default 0,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  error         text
);

-- ------------------------------------------------------------
-- Seguridad: RLS activo, sin políticas públicas.
-- El backend usa SUPABASE_SERVICE_ROLE_KEY (bypassa RLS).
-- El navegador NUNCA toca la base directamente.
-- ------------------------------------------------------------
alter table contracts     enable row level security;
alter table findings      enable row level security;
alter table deep_analyses enable row level security;
alter table ingest_runs   enable row level security;
