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
| COLUSION_PREVIA | A (PACO) | contratista | 45 | Acuerdos restrictivos de la competencia (Ley 155/1959 art. 1); colusión sancionada por la SIC |
| OBRA_INCONCLUSA | A (PACO) | ambos | 40 | Registro Nacional de Obras Civiles Inconclusas (Ley 2020 de 2020). **No implementable contra este corpus — ver §7** |
| ANTECEDENTE_OBRA_INCONCLUSA | A (PACO) | contratista | 25→35 | Ley 2020 de 2020; el contratista figura en el registro por otra obra. Sube a 35 si la obra inconclusa es con la MISMA entidad que vuelve a contratarlo |
| LICITANTE_UNICO | A (processes) | entidad | 25 | Libre concurrencia (Ley 80 art. 24); proceso competitivo con un solo oferente |
| MISMO_SUPERVISOR | A | entidad | 15 | Deberes de supervisión (Ley 1474/2011 arts. 83-84). SOLO agravante, nunca dispara prioridad por sí solo |

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
- **DICIEMBRE / PAGO_ADELANTADO_RIESGO / MISMO_SUPERVISOR:** nunca elevan prioridad
  por sí solos.
- **Reglas contra snapshots PACO** (INHABILIDAD_REP_LEGAL, SANCIONES_PREVIAS,
  COLUSION_PREVIA, ANTECEDENTE_OBRA_INCONCLUSA): el match es **siempre por número
  de documento exacto, nunca por nombre**. PACO publica los NIT con dígito de
  verificación pegado y SECOP sin él, así que se compara contra ambas variantes.
  Todo hallazgo declara en `evidence` la fuente y la fecha del snapshot: son
  fotos, no consulta viva.
- **INHABILIDAD_REP_LEGAL:** dos fuentes. (a) Boletín de Responsables Fiscales:
  figurar en él ES el efecto inhabilitante mientras dure la inclusión (Ley 610 de
  2000 art. 60), así que el match exacto basta para confianza **alta**. (b) SIRI,
  cruzado contra `representante_id` y contra `documento_proveedor` cuando el
  contratista es persona natural. Con fecha de providencia y duración se calcula
  vigencia → confianza **alta**; sin plazo declarado (típico de DESTITUCION) →
  confianza **media** y el detail dice "vigencia por confirmar". **Nunca se afirma
  inhabilidad activa sin fecha que la respalde.**
- **MISMO_SUPERVISOR:** ≥N contratos del par (cédula del supervisor, documento del
  proveedor), match por cédula exacta. `MISMO_SUPERVISOR_MIN`, default 4.
  **Umbral relativo al corpus**: con 20.000 de los 201.331 contratos de Atlántico
  el máximo observado por par es 5, así que un umbral de 10 daría cero; al
  ingestar el universo completo se reevalúa al alza. Confianza alta si el
  proveedor concentra ≥1/3 de lo que esa persona supervisa, media si menos.

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

#### Procedencia de la cifra

`valor_pagado = 0` es ambiguo en el dataset de contratos: puede significar "no
se ha pagado" o "la entidad no reportó". No es un caso marginal — 12.784
contratos vigentes del corpus lo reportan en cero, y 7.929 de ellos figuran
"En ejecución". Tratar ese cero como un hecho sería afirmar lo que el dato no
sostiene (§6.1); tratarlo siempre como vacío sería renunciar a una señal real.

El **plan de pagos de SECOP II** (datos.gov.co `uymx-8p3j`, 20,8M filas) lo
desambigua factura por factura, con estado y fecha real de pago. Su fidelidad se
validó contra el propio SECOP: en los contratos que sí reportan pago, la suma de
las filas en estado "Pagado" coincide con `valor_pagado` (194 de 199 en la
muestra, ninguno excede el valor del contrato).

Toda cifra de plata en riesgo lleva por tanto una **procedencia**, y la interfaz
está obligada a mostrarla:

| Procedencia | Condición | Qué se puede afirmar |
|---|---|---|
| `corroborado` | hay plan de pagos para el contrato | El desembolso, con su fecha. Si no hay ninguna factura pagada, el cero es un hecho verificado, no un vacío. |
| `reportado` | sin plan de pagos, pero la entidad reportó ejecución | Lo que la entidad declara, como declaración suya. |
| `sin_rastro` | ni pagos reportados ni plan de pagos | Nada sobre la ejecución. La cifra mostrada es el valor total del contrato y debe etiquetarse como tal. |

Cuando hay plan de pagos, este manda sobre `valor_pendiente_ejecucion`: es
evidencia por factura frente a un agregado autodeclarado.

El plan de pagos aporta además `pagos_en_tramite` —facturado aprobado o radicado
que todavía no ha salido—, que es la señal más temprana disponible de plata a
punto de desembolsarse, y el supervisor del contrato, segunda fuente para
MISMO_SUPERVISOR.

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

### SECOP II no expone los adjuntos de forma programática

Los documentos de un proceso (pliego, estudios previos, anexos técnicos) **no son
descubribles automáticamente**. Se verificaron las tres rutas posibles:

1. **HTML de `url_proceso`**: devuelve el shell de una SPA. Tres procesos distintos
   entregan exactamente los mismos 20.927 bytes, sin un solo enlace a documentos.
2. **Extracción vía Croma** (`/global/extract/json/v1`): `502 content_upstream`.
   Choca con la misma SPA.
3. **Navegador automatizado** (Playwright, Chromium completo, recursos bloqueados):
   la página responde con título `ReCaptcha` y el texto *"Por favor, complete la
   validación para acceder a la página"*. De toda la sesión se captura **una sola
   petición XHR: el archivo de traducciones del propio reCAPTCHA**. El contenido
   del proceso nunca se renderiza.
4. **API OCDS de Colombia Compra Eficiente**: `apiocds.colombiacompra.gov.co`
   devuelve **502 Bad Gateway en todas las rutas, incluida la raíz**, con los dos
   prefijos publicados (`apiCCE2.0` y `apiCCE-2.0`). El gateway responde; el
   backend está caído. La API que el registro de Open Contracting Partnership
   lista para Colombia —`colombiacompra.gov.co/transparencia/api`— redirige a una
   página de glosario. Y el volcado OCDS registrado **cubre Ene 2011 – Abr 2022 y
   está marcado *"no longer updated by the publisher"***.
5. **Barrido de rutas públicas de SECOP II**: el captcha es *selectivo*.
   `ContractNoticePhases/View` responde 200 sin captcha, pero es un cascarón
   estático que ni siquiera usa su parámetro `unique`. Bajo `/Public/Archive/`
   **solo existe `RetrieveFile`**: las otras diez rutas probadas dan 404, y
   `RetrieveFile` sin `DocumentId` responde *"Ha ocurrido un error al descargar el
   archivo"*. No hay ninguna ruta pública de listado.

**Esto es en sí un hallazgo de transparencia.** El Estado colombiano publica los
datos estructurados de su contratación como datos abiertos, pero **los documentos
que sustentan esas cifras —pliegos, estudios previos, otrosíes— no son accesibles
de forma programática**: su API OCDS lleva años sin actualizar y su portal protege
las páginas con reCAPTCHA. Auditar a escala exige exactamente esos documentos.

SECOP II protege esas páginas con Google reCAPTCHA. **Tekel no intenta resolverlo
ni evadirlo**: es un control de acceso que el titular del sitio puso
deliberadamente, y sortearlo a escala sería precisamente lo que ese control busca
impedir.

Lo que sí funciona, y sobre lo que se construye:

- **La descarga por identificador es pública y directa.** Con un `DocumentId`
  conocido, `community.secop.gov.co/Public/Archive/RetrieveFile/Index?DocumentId=…`
  entrega el PDF con un GET sin sesión (verificado: 632 KB, `%PDF-1.7`). El cuello
  de botella es descubrir el identificador, no obtener el archivo.
- **Por eso `needs_upload` es un estado de primera clase del motor, no un
  fallback.** Cuando no hay documento descubierto, el análisis se detiene en ese
  estado, el usuario aporta el PDF —que es público y él sí puede descargar— y el
  flujo se reanuda solo desde el paso de análisis. La cadena completa
  (forense → documentos → pliego → expediente) queda intacta.

**Arquitectura de documentos (congelada):**

1. `discover` intenta lo barato y **falla rápido, con tope de 5 s**. No se
   insiste contra un muro conocido.
2. `upload` acepta **varios PDF a la vez**, los clasifica por tipo y los rutea:
   el pliego alimenta PLIEGO_SASTRE; el otrosí aporta los **montos reales de la
   adición**, que ascienden ADICIONES_50 de aproximada a **confianza alta**
   —justo el dato que ni SECOP ni Croma publican.
3. **Roadmap declarado**: descubrimiento automatizado vía navegador headless o
   vía API OCDS **cuando CCE restablezca el servicio**. La pieza que falta es de
   ellos, no nuestra: la descarga por `DocumentId` ya funciona.

### Fuentes disponibles que NO se usan, y por qué

- **Sanciones penales FGN (PACO).** Descargable, no cargado. El archivo no trae
  ningún identificador de persona: son agregados por municipio y tipo de delito
  (`DEPARTAMENTO, MUNICIPIO, TITULO, CAPITULO, ARTICULO, AÑO`). Usar densidad
  municipal de delitos dentro del score sería **falacia ecológica**: castigaría
  la ubicación del contrato, no la conducta del contratista. En el roadmap queda
  como capa de contexto territorial **en el mapa, nunca en el score**.
- **OBRA_INCONCLUSA por código de contrato.** El Registro Nacional de Obras
  Civiles Inconclusas identifica las obras con códigos de SECOP I / pre-CO1
  (`3600`, `001`, `721033`), incompatibles con los identificadores de SECOP II
  del corpus (`CO1.PCCNTR.*`). El patrón queda declarado en §3 pero sin
  implementar; el cruce viable es por documento del contratista
  (ANTECEDENTE_OBRA_INCONCLUSA).
- **Plan de entregas planeado vs real (Croma).** `execution_items` viene vacío
  en los contratos probados, así que no hay base para comparar lo planeado con
  lo ejecutado.
- **Valor de las adiciones (Croma).** `additions` en `/co/secop/contract/v1`
  trae identificador, tipo, descripción y fecha, pero **no el monto**. ADICIONES_50
  sigue en modo aproximado declarado.
- **Colusiones SIC.** Cargado y con la regla activa, pero da 0 matches contra el
  corpus actual: son 103 casos de alcance nacional frente a un solo departamento.
  Se mantiene porque cuesta cero y con más territorio puede disparar.
