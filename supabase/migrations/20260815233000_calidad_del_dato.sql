-- ============================================================
-- Controles de calidad del dato — METODOLOGIA §6
--
-- Dos correcciones sobre el corpus. Ninguna borra ni recorta información:
-- que una entidad reporte un dato imposible es en sí un dato de transparencia.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Valores inverosímiles: se marcan, no se corrigen.
--    El contrato se conserva íntegro y visible, pero queda fuera de todo
--    agregado para que un titular tipo "$X en riesgo" sea defendible.
-- ------------------------------------------------------------
alter table contracts
  add column if not exists valor_verificar boolean not null default false;

comment on column contracts.valor_verificar is
  'true = el valor reportado en SECOP es inverosímil. El contrato se conserva y '
  'se muestra con aviso, pero se excluye de agregados y del pool de comparables '
  'de VALOR_ATIPICO.';

create index if not exists idx_contracts_valor_verificar
  on contracts (valor_verificar);

-- Saneamiento del corpus ya ingestado. La misma lógica vive en
-- scripts/ingest.ts (esValorInverosimil), que marca las filas nuevas al entrar.
--   > 1 billón COP  : para un corpus departamental, un contrato individual por
--                     encima de esa cifra es casi con certeza error de reporte.
--   valor <= 0 con pagos registrados : el contrato movió dinero que su propio
--                     valor declarado no puede explicar.
update contracts
set valor_verificar = true
where valor_contrato > 1e12
   or (coalesce(valor_contrato, 0) <= 0 and coalesce(valor_pagado, 0) > 0);

-- ------------------------------------------------------------
-- 2. Estados previos a la ejecución no son 'vigente'.
--    Un borrador no es plata en riesgo y un cancelado no es evidencia
--    histórica. Antes caían en 'vigente' por el fallback de fecha_fin futura,
--    lo que inflaba la bandeja de prioridad.
--    La misma lista vive en scripts/ingest.ts (PRE_EJECUCION).
-- ------------------------------------------------------------
update contracts
set vigencia = 'otro'
where lower(trim(estado_contrato)) in (
        'borrador', 'en aprobación', 'en aprobacion', 'cancelado'
      )
  and vigencia <> 'otro';
