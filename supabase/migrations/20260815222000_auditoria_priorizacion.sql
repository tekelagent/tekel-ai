-- ============================================================
-- Priorización y calificación de hallazgos — METODOLOGIA §3 y §4
-- ============================================================

-- ------------------------------------------------------------
-- CONTRACTS: triaje P1/P2/P3
-- ------------------------------------------------------------
alter table contracts
  -- P1 revisar de inmediato · P2 esta semana · P3 monitoreo (METODOLOGIA §4)
  add column if not exists prioridad text
    check (prioridad in ('P1', 'P2', 'P3')),
  -- Vigentes: valor_pendiente_ejecucion (o valor - pagado).
  -- Históricos: valor_pagado, como techo del posible detrimento.
  add column if not exists plata_en_riesgo numeric,
  -- Razones del "por qué ahora", compuestas desde los datos.
  -- Arreglo de strings en español; nunca texto generado por LLM.
  add column if not exists porque_ahora jsonb;

-- ------------------------------------------------------------
-- FINDINGS: confianza y foco (METODOLOGIA §3)
-- ------------------------------------------------------------
alter table findings
  -- Según completitud de los datos que sustentan el hallazgo.
  add column if not exists confianza text
    check (confianza in ('alta', 'media', 'baja')),
  -- A quién apunta la verificación.
  add column if not exists foco text
    check (foco in ('entidad', 'contratista', 'ambos'));

-- ------------------------------------------------------------
-- Índices para las vistas de triaje
-- ------------------------------------------------------------
create index if not exists idx_contracts_prioridad
  on contracts (prioridad);
create index if not exists idx_contracts_plata_riesgo
  on contracts (plata_en_riesgo desc nulls last);
-- La bandeja principal: P1 ordenada por plata recuperable.
create index if not exists idx_contracts_prioridad_plata
  on contracts (prioridad, plata_en_riesgo desc nulls last);
create index if not exists idx_findings_confianza
  on findings (confianza);
create index if not exists idx_findings_foco
  on findings (foco);
