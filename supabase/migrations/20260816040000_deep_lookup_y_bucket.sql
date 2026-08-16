-- ============================================================
-- Búsqueda de análisis por identificador público + bucket de documentos
-- ============================================================

-- Los endpoints reciben el `id_contrato` que ve el ciudadano (CO1.PCCNTR.…),
-- no el uuid interno. Guardarlo aquí evita una resolución extra en cada uno de
-- los muchos /advance que hace el frontend durante un análisis en vivo.
alter table deep_analyses
  add column if not exists id_contrato_ref text;

create unique index if not exists idx_deep_id_contrato_ref
  on deep_analyses (id_contrato_ref);

-- Backfill para los análisis que ya existieran.
update deep_analyses d
set id_contrato_ref = c.id_contrato
from contracts c
where d.contract_id = c.id and d.id_contrato_ref is null;

-- documents también se consulta por el identificador público.
create index if not exists idx_documents_id_contrato on documents (id_contrato);

-- ------------------------------------------------------------
-- Bucket privado 'docs'. Solo entran los pliegos que se analizan y los que
-- suben los usuarios; el resto de adjuntos se enlaza a la URL oficial de SECOP
-- (METODOLOGIA §7), que además es lo verificable en la fuente.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('docs', 'docs', false)
on conflict (id) do nothing;
