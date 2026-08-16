-- ============================================================
-- SECOP II — Plan de pagos (datos.gov.co uymx-8p3j)
--
-- Por qué importa: el dataset de contratos trae `valor_pagado`, pero 12.784
-- contratos vigentes lo reportan en 0 — 7.929 de ellos "En ejecución". Leído
-- solo, ese cero es ambiguo: puede ser "no se ha pagado" o "no se reportó".
--
-- Este dataset desambigua, factura por factura. Sondeo sobre 400 contratos
-- (scripts/probe-pagos.ts):
--   · Contratos que SÍ reportan pago: 199/200 tienen plan de pagos, y la suma
--     de las filas en estado "Pagado" coincide con `valor_pagado` al peso.
--     El dataset es fiel.
--   · Contratos con valor_pagado = 0: 129/200 tienen plan de pagos y CERO
--     filas pagadas. El cero es real, no un vacío de reporte.
--   · El 35,5% restante no tiene ninguna fila: ahí sí no se puede afirmar nada.
--
-- Se une por `payments.id_contrato = contracts.id_contrato` (el dataset lo
-- expone como `id_del_contrato`, mismo formato CO1.PCCNTR.*). Sin sorpresas
-- de clave, a diferencia de `processes`.
-- ============================================================

create table if not exists payments (
  id                    uuid primary key default gen_random_uuid(),
  id_contrato           text not null,
  -- Identificador de la fila de pago dentro del contrato. Junto con
  -- id_contrato forma la clave natural para que la ingesta sea idempotente.
  id_pago               bigint not null,
  numero_factura        text,
  -- "Pagado" | "Aprobado" | "Bajo Aprobación" | "Enviado Por Proveedor" |
  -- "Pendiente Registro" | "Rechazado". Solo "Pagado" implica plata que salió.
  estado                text,
  valor_a_pagar         numeric,
  valor_total           numeric,
  -- Presente solo cuando el pago se ejecutó. Es la prueba del desembolso.
  fecha_real_de_pago    date,
  fecha_estimada_de_pago date,
  fecha_de_emision      date,
  -- El dataset trae supervisor por contrato: habilita MISMO_SUPERVISOR
  -- (METODOLOGIA §3), que hasta ahora no teníamos de dónde sacar.
  nombre_supervisor     text,
  documento_supervisor  text,
  nit_entidad           text,
  documento_proveedor   text,
  raw                   jsonb,
  ingested_at           timestamptz not null default now(),
  unique (id_contrato, id_pago)
);

create index if not exists payments_contrato_idx on payments (id_contrato);
create index if not exists payments_estado_idx on payments (estado);
-- Para MISMO_SUPERVISOR: agrupar contratos por documento del supervisor.
create index if not exists payments_supervisor_idx on payments (documento_supervisor)
  where documento_supervisor is not null;

alter table payments enable row level security;

-- ------------------------------------------------------------
-- Agregados materializados en contracts.
--
-- Se guardan aquí y no se calculan al vuelo porque el dashboard ordena y
-- filtra por plata en riesgo sobre 19k filas: un join agregado por request
-- sería el cuello de botella de la página.
-- ------------------------------------------------------------
alter table contracts
  -- Suma de las filas en estado "Pagado". Es el desembolso corroborado.
  add column if not exists pagos_confirmados numeric,
  -- Facturado que aún no sale: aprobado, enviado o pendiente de registro.
  -- Plata comprometida — el aviso más temprano posible.
  add column if not exists pagos_en_tramite numeric,
  -- Cuántas filas de plan de pagos tiene. 0 = sin rastro, no se afirma nada.
  add column if not exists pagos_filas integer,
  -- Fecha del último desembolso corroborado.
  add column if not exists pagos_ultima_fecha date,
  -- Supervisor del contrato según el plan de pagos.
  add column if not exists supervisor_nombre text,
  add column if not exists supervisor_documento text;

comment on column contracts.pagos_confirmados is
  'Suma de facturas en estado Pagado (dataset uymx-8p3j). null = sin rastro de pagos.';
comment on column contracts.pagos_en_tramite is
  'Facturado aprobado/enviado/pendiente que todavia no se ha desembolsado.';
comment on column contracts.pagos_filas is
  'Filas de plan de pagos. 0 significa que no se puede afirmar nada sobre ejecucion.';

create index if not exists contracts_supervisor_idx on contracts (supervisor_documento)
  where supervisor_documento is not null;
