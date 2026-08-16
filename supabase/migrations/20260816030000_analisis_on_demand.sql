-- ============================================================
-- Análisis on-demand — máquina de estados de la Capa C
--
-- `deep_analyses` pasa de ser una caché de resultado a ser el registro de un
-- trabajo por pasos. El frontend llama /advance en bucle y pinta `log`, que es
-- lo que produce la sensación de análisis en vivo sin infraestructura nueva.
-- ============================================================

alter table deep_analyses
  -- Paso pendiente: forense (Croma) → docs (descubrir/descargar) → pliego (LLM).
  add column if not exists stage text,
  -- Array de {ts, msg}: líneas humanas que la UI va pintando.
  add column if not exists log jsonb not null default '[]'::jsonb,
  add column if not exists cost_usd numeric not null default 0,
  -- Marca de tiempo del último avance, para detectar trabajos colgados.
  add column if not exists last_advance_at timestamptz;

-- El estado gana 'queued' y 'needs_upload'. Este último no es un error: en
-- SECOP II los adjuntos no son descubribles sin navegador, así que esperar el
-- PDF del usuario es parte del diseño (METODOLOGIA §7).
alter table deep_analyses drop constraint if exists deep_analyses_status_check;
alter table deep_analyses
  add constraint deep_analyses_status_check
  check (status in ('queued', 'running', 'needs_upload', 'done', 'error'));

create index if not exists idx_deep_status on deep_analyses (status);
create index if not exists idx_deep_stage  on deep_analyses (stage);

-- ------------------------------------------------------------
-- DOCUMENTS: metadata de adjuntos. Los PDF NO se almacenan en masa: se guarda
-- la URL oficial de SECOP y la UI enlaza allí, que además es lo verificable en
-- la fuente. A Storage solo van los pliegos analizados y los que suba un usuario.
-- ------------------------------------------------------------
create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid references contracts(id) on delete cascade,
  -- Se guarda también el id textual: los documentos se descubren por proceso,
  -- que puede llegar antes que el contrato al hacer análisis en vivo.
  id_contrato   text,
  notice_uid    text,
  document_id   text,
  nombre        text,
  tipo          text check (tipo in ('pliego','contrato','otrosi','estudios','anexo','otro')),
  status        text not null default 'pending'
                check (status in ('pending','downloaded','parsed','analyzed','error')),
  -- URL oficial en SECOP: es la que ve el ciudadano.
  url_oficial   text,
  -- Solo se llena para los que sí se descargan (P1 y subidos por usuarios).
  storage_path  text,
  paginas       integer,
  tiene_texto   boolean,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (contract_id, document_id)
);

create index if not exists idx_documents_contract on documents (contract_id);
create index if not exists idx_documents_notice   on documents (notice_uid);
create index if not exists idx_documents_tipo     on documents (tipo, status);

alter table documents enable row level security;

-- ------------------------------------------------------------
-- Cuota de análisis en vivo: el jurado usa la plataforma sin supervisión, así
-- que el gasto tiene que estar acotado por diseño, no por confianza.
-- ------------------------------------------------------------
create table if not exists analysis_quota (
  dia           date primary key,
  ejecutados    integer not null default 0,
  costo_usd     numeric not null default 0,
  updated_at    timestamptz not null default now()
);

alter table analysis_quota enable row level security;
