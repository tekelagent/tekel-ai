-- ============================================================
-- Snapshots PACO (portal.paco.gov.co) — batch forense de Capa A
--
-- Son FOTOS con fecha, no consulta viva. La verificación fresca es Croma en
-- Capa C. Cada tabla guarda `snapshot_fecha` y la fila cruda en `raw`.
--
-- El match es SIEMPRE por número de documento exacto, nunca por nombre: el
-- cruce por nombre produce homonimia y METODOLOGIA §6.6 solo admite alta
-- confianza en cruces por documento.
--
-- sanciones_penales_FGN NO se carga: no trae identificadores, solo agregados
-- por municipio. Usar densidad municipal de delitos en el score sería falacia
-- ecológica — castigaría ubicación, no conducta. Declarado en METODOLOGIA §7.
-- ============================================================

-- ------------------------------------------------------------
-- Responsabilidades fiscales (Contraloría).
-- Figurar en el boletín ES el efecto inhabilitante mientras se esté listado
-- (Ley 610 de 2000 art. 60), así que el match exacto basta: confianza alta.
-- ------------------------------------------------------------
create table if not exists paco_responsabilidades_fiscales (
  id              uuid primary key default gen_random_uuid(),
  documento       text not null,
  nombre          text,
  entidad_afectada text,
  departamento    text,
  municipio       text,
  snapshot_fecha  date not null,
  raw             jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_paco_fiscales_doc on paco_responsabilidades_fiscales (documento);

-- ------------------------------------------------------------
-- Antecedentes disciplinarios SIRI (Procuraduría).
-- Son cédulas de personas naturales: matchea contra representante_id y contra
-- documento_proveedor cuando el contratista es persona natural.
-- La vigencia se calcula con fecha_providencia + duración cuando existe.
-- ------------------------------------------------------------
create table if not exists paco_siri (
  id                 uuid primary key default gen_random_uuid(),
  documento          text not null,
  tipo_documento     text,
  nombre             text,
  sancion            text,
  duracion_anios     numeric,
  duracion_meses     numeric,
  duracion_dias      numeric,
  fecha_providencia  date,
  -- null = la sanción no declara plazo (típico de DESTITUCION): el hallazgo
  -- sale con confianza media y "vigencia por confirmar".
  vigente_hasta      date,
  entidad            text,
  cargo              text,
  snapshot_fecha     date not null,
  raw                jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists idx_paco_siri_doc on paco_siri (documento);

-- ------------------------------------------------------------
-- Multas y sanciones contractuales (SECOP).
-- ------------------------------------------------------------
create table if not exists paco_multas (
  id             uuid primary key default gen_random_uuid(),
  documento      text not null,
  nombre         text,
  entidad        text,
  nit_entidad    text,
  resolucion     text,
  referencia     text,
  valor_multa    numeric,
  fecha          date,
  url            text,
  snapshot_fecha date not null,
  raw            jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_paco_multas_doc on paco_multas (documento);

-- ------------------------------------------------------------
-- Colusiones en contratación pública (SIC). Solo ~103 filas, pero cada match
-- es señal de altísima calidad.
-- ------------------------------------------------------------
create table if not exists paco_colusiones (
  id                 uuid primary key default gen_random_uuid(),
  documento          text not null,
  nombre             text,
  tipo_persona       text,
  caso               text,
  falta              text,
  resolucion_sancion text,
  multa_inicial      numeric,
  fecha_radicacion   date,
  snapshot_fecha     date not null,
  raw                jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists idx_paco_colusiones_doc on paco_colusiones (documento);

-- ------------------------------------------------------------
-- Registro Nacional de Obras Inconclusas (Ley 2020 de 2020).
-- Dos señales distintas: por codigo_secop = ESTE contrato está registrado;
-- por documento = el proveedor tiene OTRAS obras inconclusas.
-- ------------------------------------------------------------
create table if not exists paco_obras_inconclusas (
  id             uuid primary key default gen_random_uuid(),
  codigo_secop   text,
  documento      text,
  nombre         text,
  nit_entidad    text,
  entidad        text,
  objeto         text,
  valor_contrato numeric,
  estado         text,
  departamento   text,
  ciudad         text,
  snapshot_fecha date not null,
  raw            jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_paco_obras_secop on paco_obras_inconclusas (codigo_secop);
create index if not exists idx_paco_obras_doc   on paco_obras_inconclusas (documento);

-- ------------------------------------------------------------
-- RLS activo y sin políticas: igual que el resto del schema, el acceso es
-- server-side con service role.
-- ------------------------------------------------------------
alter table paco_responsabilidades_fiscales enable row level security;
alter table paco_siri                       enable row level security;
alter table paco_multas                     enable row level security;
alter table paco_colusiones                 enable row level security;
alter table paco_obras_inconclusas          enable row level security;
