-- ============================================================
-- Normalización del dígito de verificación en los documentos de PACO.
--
-- PACO publica los NIT con DV pegado (830040193-5 llega como "8300401935"),
-- mientras SECOP publica `documento_proveedor` sin él ("901100455"). Sin
-- normalizar, el cruce daba casi cero.
--
-- Se materializa en una columna indexada en vez de resolverlo con left() en el
-- JOIN: esa forma no usa índice y la consulta excedía el statement timeout
-- contra 46.000 filas de SIRI.
-- ============================================================

alter table paco_responsabilidades_fiscales add column if not exists documento_base text;
alter table paco_siri                       add column if not exists documento_base text;
alter table paco_multas                     add column if not exists documento_base text;
alter table paco_colusiones                 add column if not exists documento_base text;
alter table paco_obras_inconclusas          add column if not exists documento_base text;

-- Un NIT colombiano tiene 9 dígitos + DV; una cédula, hasta 10 sin DV. Con 10
-- dígitos o más se guarda también la variante sin el último dígito, y el match
-- prueba contra ambas: así no se pierde ni el NIT con DV ni la cédula larga.
update paco_responsabilidades_fiscales
  set documento_base = case when length(documento) >= 10 then left(documento, length(documento) - 1) else documento end;
update paco_siri
  set documento_base = case when length(documento) >= 10 then left(documento, length(documento) - 1) else documento end;
update paco_multas
  set documento_base = case when length(documento) >= 10 then left(documento, length(documento) - 1) else documento end;
update paco_colusiones
  set documento_base = case when length(documento) >= 10 then left(documento, length(documento) - 1) else documento end;
update paco_obras_inconclusas
  set documento_base = case when length(documento) >= 10 then left(documento, length(documento) - 1) else documento end;

create index if not exists idx_paco_fiscales_base   on paco_responsabilidades_fiscales (documento_base);
create index if not exists idx_paco_siri_base       on paco_siri (documento_base);
create index if not exists idx_paco_multas_base     on paco_multas (documento_base);
create index if not exists idx_paco_colusiones_base on paco_colusiones (documento_base);
create index if not exists idx_paco_obras_base      on paco_obras_inconclusas (documento_base);
