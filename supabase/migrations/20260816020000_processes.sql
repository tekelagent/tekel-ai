-- ============================================================
-- SECOP II — Procesos de Contratación (datos.gov.co p6dx-8zbt)
--
-- Se une a `contracts` por `contracts.proceso_de_compra = processes.portafolio_id`.
-- OJO con la clave: el dataset expone `id_del_proceso` (CO1.REQ.*) y
-- `id_del_portafolio` (CO1.BDOS.*); el que aparece en los contratos es el
-- segundo. Unir por el primero da cero.
-- ============================================================

create table if not exists processes (
  id                     uuid primary key default gen_random_uuid(),
  -- Clave de join con contracts.proceso_de_compra
  portafolio_id          text unique not null,
  proceso_id             text,
  referencia             text,
  nombre                 text,
  entidad                text,
  nit_entidad            text,
  departamento_entidad   text,
  modalidad              text,
  tipo_de_contrato       text,
  fase                   text,
  estado_procedimiento   text,
  -- Presupuesto oficial del proceso, base de VALOR_ATIPICO v2
  precio_base            numeric,
  -- Valor adjudicado inicial, base de ADICIONES_50 v2
  valor_adjudicacion     numeric,
  adjudicado             boolean,
  nit_adjudicado         text,
  -- Concurrencia, base de LICITANTE_UNICO
  respuestas             integer,
  respuestas_externas    integer,
  proveedores_invitados  integer,
  proveedores_unicos     integer,
  proveedores_manifestaron integer,
  -- El dataset NO publica fecha de cierre de ofertas: solo publicación y
  -- fase 3. PLAZO_RELAMPAGO solo puede aproximarse con esa ventana.
  fecha_publicacion      date,
  fecha_publicacion_fase3 date,
  fecha_ultima_publicacion date,
  url_proceso            text,
  raw                    jsonb,
  ingested_at            timestamptz not null default now()
);

create index if not exists idx_processes_portafolio on processes (portafolio_id);
create index if not exists idx_processes_nit        on processes (nit_entidad);

alter table processes enable row level security;
