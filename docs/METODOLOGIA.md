# Metodología de Auditoría — Tekel Agent

Especificación funcional del motor de auditoría. Este documento es la fuente de
verdad sobre QUÉ detecta Tekel, CON QUÉ criterio normativo, CÓMO prioriza y
QUÉ límites declara. El código implementa esto; ante ambigüedad, manda este documento.

## 1. Usuarios y propósito

- **Contraloría (control fiscal):** priorizar dónde puede haber detrimento
  patrimonial y actuar de forma concomitante mientras el dinero aún no se ha
  desembolsado (marco del control concomitante y preventivo, Decreto Ley 403 de 2020).
- **Procuraduría (control disciplinario):** identificar contratos donde la
  conducta de servidores públicos (supervisor, ordenador del gasto, estructurador)
  amerita verificación.
- **Veedurías, periodistas y ciudadanía:** las mismas señales, en lenguaje claro
  y siempre verificables en la fuente (SECOP).

**Principio rector:** Tekel no prueba corrupción. Detecta las huellas que las
irregularidades dejan en datos oficiales y explica por qué un contrato merece
revisión humana antes que otros. Indicador ≠ imputación.

## 2. Pipeline de auditoría (5 etapas)

```
1. INGESTA        SECOP II (datos abiertos) → contracts, con fila cruda en `raw`
2. CAPA A         Reglas deterministas sobre datos estructurados (costo $0)
3. CAPA B         LLM barato por lote: coherencia semántica + resumen ciudadano
4. CAPA C         On-demand: forense Croma + verificación normativa (Legalize,
                  conceptos CCE) + análisis de pliego si hay PDF
5. PRIORIZACIÓN   Score → triaje P1/P2/P3 → Expediente de Priorización
```

Las capas A y B corren batch sobre todo el corpus. La C corre al hacer clic
(y se cachea). La priorización se recalcula tras cada capa.

## 3. Catálogo de patrones

Cada patrón declara: capa, foco (a quién apunta la verificación), criterio
normativo, puntos, condiciones de exclusión (cuándo NO opina) y confianza.

| Código | Capa | Foco | Pts | Criterio normativo (catálogo) |
|---|---|---|---|---|
| INHABILIDAD_REP_LEGAL | Croma | contratista+entidad | 45 | Régimen de inhabilidades e incompatibilidades (Ley 80/1993 art. 8; antecedentes SIRI/SIBOR) |
| PROVEEDOR_RECIENTE | Croma | contratista | 40 | Capacidad e idoneidad del contratista (deber de selección objetiva, Ley 80 art. 29 / Ley 1150 art. 5) |
| ADICIONES_50 | A | entidad | 40 | Ley 80/1993 art. 40 parágrafo: adición máxima 50% del valor inicial (medido en SMMLV) |
| MOROSO_BDME | Croma | contratista | 40 | Inhabilidad por inclusión en el Boletín de Deudores Morosos del Estado (régimen BDME; verificar texto vigente vía Legalize) |
| FRACCIONAMIENTO | A | entidad | 30 | Derivado de principios de transparencia y selección objetiva (Ley 80 art. 24; conceptos ANCP-CCE sobre fraccionamiento) |
| PLIEGO_SASTRE | C-LLM | entidad | 25 | Libre concurrencia y selección objetiva (Ley 80 art. 24; Decreto 1082/2015) |
| DESEQUILIBRIO_PAGOS | A | entidad (supervisión) | 25 | Deberes de supervisión e interventoría (Ley 1474/2011 arts. 83-84) |
| PLAZO_RELAMPAGO | C-LLM | entidad | 25 | Plazos razonables de publicidad (Decreto 1082/2015) |
| SANCIONES_PREVIAS | Croma | contratista | 25 | Historial sancionatorio en SECOP como indicio de riesgo de cumplimiento |
| VALOR_ATIPICO | A | ambos | 25 | Economía y planeación (Ley 80 arts. 25-26); precio fuera de rango de comparables |
| EJECUCION_ANOMALA | A | entidad | 25 | Deber de liquidación (Ley 80 art. 60 / Ley 1150 art. 11); ejecución incompleta |
| CONCENTRACION_PROVEEDOR | A | ambos | 20 | Indicio de direccionamiento o captura (principio de selección objetiva) |
| OBJETO_CIIU_INCOHERENTE | Croma | contratista | 20 | Idoneidad y capacidad (objeto social RUES vs objeto contractual) |
| PAGO_ADELANTADO_RIESGO | A | entidad | 10→30 | Manejo de anticipos (Ley 1474/2011 art. 91); sube a 30 si el proveedor es reciente |
| DICIEMBRE | A | entidad | 10 | Indicio de deficiencia de planeación (Ley 80 arts. 25-26). SOLO agravante, nunca dispara prioridad por sí solo |
| OBJETO_DIFUSO | B-LLM | entidad | 10 | Deber de planeación y definición del objeto |

Las referencias normativas del catálogo son puntos de partida curados. En Capa C,
el texto vigente del artículo se recupera vía Croma Legalize y los conceptos
interpretativos vía ANCP-CCE conceptos-search. **Regla anti-alucinación: ningún
componente LLM puede citar normas que no estén en este catálogo o en texto
recuperado en la misma sesión.**

### Condiciones de exclusión y confianza (Capa A)

- **DESEQUILIBRIO_PAGOS:** requiere fecha_inicio, fecha_fin y valor_pagado no
  nulos; plazo total > 60 días; valor > piso de materialidad. Dispara si
  %pagado − %tiempo ≥ 25 puntos. Confianza alta solo con los tres campos presentes.
- **ADICIONES_50:** requiere identificar valor inicial vs adicionado. Si el dataset
  solo trae `dias_adicionados` (tiempo) o el valor ya consolidado, la regla opera
  en modo aproximado y lo declara en evidence (`aproximacion: true`). Nota: la
  norma mide el 50% en SMMLV del valor inicial; la comparación en pesos corrientes
  es una aproximación aceptable en contratos de corta duración y se declara.
- **VALOR_ATIPICO:** requiere ≥30 comparables (mismo tipo_de_contrato + mismo
  departamento); dispara solo si valor > percentil 95 Y ≥ 2× mediana del grupo.
  Evidence: mediana, N, ratio. Sin comparables suficientes, se abstiene.
- **EJECUCION_ANOMALA (históricos):** dispara si (a) terminado hace >6 meses sin
  liquidar —solo si el campo de liquidación es fiable en el corpus—, o
  (b) valor_pendiente_ejecucion > 20% del valor estando terminado, o (c) estado
  indica terminación anormal/cesión. Evidence indica cuál condición.
- **FRACCIONAMIENTO:** ≥3 contratos de la misma entidad al mismo proveedor, cada
  uno bajo umbral de menor/mínima cuantía, con objetos similares, en ventana de
  12 meses. El piso de materialidad NO aplica aquí: lo pequeño es la señal.
- **CONCENTRACION_PROVEEDOR:** mismo documento_proveedor con ≥N contratos (default
  8) o ≥X% del valor contratado por la entidad en 24 meses.
- **DICIEMBRE / PAGO_ADELANTADO_RIESGO:** nunca elevan prioridad por sí solos.

Cada finding almacena: `confianza` (alta/media/baja según completitud de datos),
`foco`, y `evidence` con las cifras exactas que dispararon (nunca texto genérico).

## 4. Modelo de priorización (triaje)

El score (Σ puntos, tope 100; 0-29 bajo, 30-64 medio, 65+ crítico) mide gravedad.
La **prioridad** añade urgencia, materialidad y corroboración:

- **P1 — Revisar de inmediato.** (vigente Y score ≥65 Y ≥2 patrones independientes
  de fuentes o naturalezas distintas Y plata_en_riesgo ≥ piso de materialidad)
  O inhabilidad activa detectada (INHABILIDAD_REP_LEGAL / MOROSO_BDME con
  confianza alta), que siempre es P1.
- **P2 — Esta semana.** Crítico histórico dentro de la ventana general de 5 años
  de la acción fiscal (Ley 610/2000 art. 9; verificar caso a caso), o vigente
  medio (40-64) con cuantía alta.
- **P3 — Monitoreo.** Resto con score ≥30.

`plata_en_riesgo`: en vigentes, valor_pendiente_ejecucion (o valor − pagado);
en históricos, valor_pagado como techo del posible detrimento.

Piso de materialidad configurable (default COP $100M) para P1 en patrones de
contrato individual. Corroboración: dos hallazgos de la misma familia (p.ej. dos
reglas de planeación) cuentan como uno para el requisito de independencia.

**Toda P1/P2 genera razones explícitas ("por qué ahora"),** compuestas desde los
datos, p.ej.: "Quedan $2.340M sin desembolsar: la intervención temprana puede
evitarlos" · "Empresa constituida 45 días antes de la adjudicación" ·
"El hecho principal ocurrió hace 3.1 años: dentro de la ventana de acción fiscal".

## 5. Expediente de Priorización (salida por contrato)

Estructura alineada con el formato de hallazgo de auditoría (condición-criterio-
efecto). Deliberadamente NO se afirma "causa": eso es del investigador.

1. **Encabezado:** entidad, contratista (NIT), objeto, valor, estado, links a
   SECOP (url_proceso) — todo verificable en fuente.
2. **Prioridad y "por qué ahora":** P1/P2/P3 con razones en cifras.
3. **Hallazgos**, cada uno con:
   - *Condición:* qué muestran los datos, en cifras exactas y español claro.
   - *Criterio:* norma del catálogo (+ texto del artículo vía Legalize y concepto
     CCE cuando la Capa C está disponible).
   - *Efecto potencial:* cuantificación (plata en riesgo / posible detrimento).
   - *Confianza* y *foco* (entidad / contratista / ambos).
4. **Perfil forense del contratista (Capa C):** RUES (antigüedad, capital, CIIU,
   representante), antecedentes del representante (SIRI/SIBOR), BDME, sanciones
   SECOP, concentración de contratos, y —opcional— procesos judiciales por nombre
   con advertencia expresa de posible homonimia (requiere verificación humana).
5. **Líneas de verificación sugeridas:** qué documentos pedir (informes de
   supervisión/interventoría de meses concretos, acta de liquidación, estudios
   previos, análisis del sector), generadas según los patrones presentes.
6. **Trazabilidad:** fecha/hora de cada consulta a fuente externa, versión del
   catálogo normativo usado.
7. **Aviso:** "Indicadores de riesgo verificables en fuentes oficiales. No
   constituye imputación ni prueba de responsabilidad."

## 6. Controles de precisión

1. **Abstención sobre invención:** toda regla con datos insuficientes se abstiene
   y lo registra; jamás rellena con supuestos.
2. **Materialidad:** evita inundar a los equipos con hallazgos de baja cuantía.
3. **Corroboración multi-patrón:** la prioridad alta exige convergencia de señales
   independientes; señales débiles solo agravan.
4. **Calibración:** tras cada corrida batch se reporta la distribución de niveles.
   Esperado sano: ~1-3% crítico. Fuera de rango → ajustar umbrales, no el mundo.
5. **Anti-alucinación normativa:** LLM restringido al catálogo + texto recuperado.
6. **Homonimia:** cruces por nombre (judicial) se marcan "no confirmado"; los
   cruces por NIT/cédula son los únicos de confianza alta.
7. **Idempotencia y auditoría:** re-correr el motor no duplica hallazgos; cada
   corrida queda registrada (ingest_runs / timestamps en evidence).
8. **Valores inverosímiles:** cuando una entidad reporta una cifra imposible, el
   contrato **se marca, no se corrige ni se oculta** (`contracts.valor_verificar`).
   Que el reporte sea imposible es en sí un dato de transparencia. Se marca si
   `valor_contrato` supera **1 billón COP** —para un corpus departamental, un
   contrato individual por encima de esa cifra es casi con certeza error de
   reporte— o si el valor es ≤ 0 pero hay pagos registrados. Los marcados quedan
   fuera de todo agregado y del pool de comparables de VALOR_ATIPICO, y se
   muestran con el aviso *"Valor reportado inverosímil según SECOP — verificar en
   la fuente"*. La razón es que el titular "$X en riesgo" debe ser defendible
   ante un auditor: en el corpus de Atlántico, 4 contratos de 20.000 inflaban la
   suma total 545 veces.
9. **Estados previos a la ejecución:** `Borrador`, `En aprobación` y `Cancelado`
   se clasifican siempre como `vigencia = 'otro'`, antes de cualquier inferencia
   por fecha. Un borrador no es plata en riesgo y un cancelado no es evidencia
   histórica; contarlos como vigentes inflaba la bandeja de prioridad. Los `otro`
   quedan fuera de ambos modos, de los agregados y del triaje.

## 7. Límites declarados (y honestos)

- No verificamos avance físico de obra (no hay fuente abierta); detectamos sus
  precursores financieros (DESEQUILIBRIO_PAGOS, EJECUCION_ANOMALA).
- No comparamos precios unitarios contra mercado (requiere extraer presupuestos
  de los PDFs); detectamos el valor total atípico contra comparables. Los precios
  unitarios son la siguiente fase con la misma arquitectura.
- La colusión entre oferentes y el copy-paste de estudios previos están en
  roadmap (requieren datos de proponentes y embeddings).
- Los criterios normativos del catálogo se verifican contra texto vigente vía
  Legalize en Capa C; el catálogo estático puede desactualizarse y por eso se
  versiona.
