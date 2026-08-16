# Tekel Agent

> *"MENE, MENE, TEKEL: pesado en la balanza y hallado falto."* — Daniel 5

Auditoría de contratación pública colombiana (SECOP II). Pesa cada contrato en la
balanza —reglas deterministas, IA y verificación forense en registros oficiales— y
explica **por qué uno merece revisión antes que otro**.

Tekel no prueba corrupción. Detecta las huellas que las irregularidades dejan en
datos oficiales y las presenta en formato de hallazgo de auditoría:
**condición · criterio · efecto**. Indicador ≠ imputación.

## Qué hace, en una frase

De 20.000 contratos, señala **82 que un equipo de control debería abrir hoy**, con
$299.281 millones de pesos aún sin desembolsar, y para cada uno dice qué mirar,
con qué norma y dónde verificarlo.

## El embudo: cuatro capas de costo creciente

```
┌─ INGESTA ────────────────────────────────────────────────────────┐
│  SECOP II (jbjy-vk9h) + Procesos (p6dx-8zbt) + snapshots PACO    │
│  20.000 contratos · 2.527 procesos · 56.000 registros forenses   │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌─ CAPA A — Reglas deterministas ($0) ─────────────────────────────┐
│  13 reglas puras y testeables sobre datos estructurados.         │
│  Cruces por número de documento contra Contraloría, Procuraduría,│
│  SIC y el Registro de Obras Inconclusas.        3.391 hallazgos  │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌─ CAPA B — LLM barato por lote (~$0,00018/contrato) ──────────────┐
│  Coherencia semántica y resumen ciudadano.  Proyección: $3,62    │
│  para todo el corpus.                                            │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌─ CAPA C — On-demand, al hacer clic ──────────────────────────────┐
│  Croma en vivo (RUES, Contraloría, Procuraduría, Contaduría,     │
│  SECOP) + análisis del pliego con cita textual y página.         │
│  Se cachea: el segundo clic es instantáneo y cuesta $0.          │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌─ PRIORIZACIÓN ───────────────────────────────────────────────────┐
│  Score (Σ puntos, tope 100) → triaje P1/P2/P3 → Expediente       │
└──────────────────────────────────────────────────────────────────┘
```

**Por qué el embudo importa**: analizar 20.000 contratos con un modelo profundo
costaría cientos de dólares y horas. Las reglas deterministas cuestan $0 y filtran
el 85%; el LLM barato pasa por lo que queda; y el modelo caro solo toca lo que un
humano decidió mirar. **La IA no reemplaza el criterio: lo enfoca.**

## Lo que lo hace distinto

- **Prioriza, no solo detecta.** Un score alto en un contrato terminado hace seis
  años vale menos que uno medio en un contrato con $2.000 millones sin desembolsar.
  El triaje pesa urgencia, materialidad y **corroboración**: exige señales de
  familias normativas distintas, porque dos reglas del mismo deber no son dos
  pruebas, son la misma vista dos veces.
- **Se abstiene.** Cuando faltan datos, la regla no opina. `ADICIONES_50` declara
  que mide tiempo y no valor porque SECOP no publica el valor adicionado; ese
  hallazgo sale con confianza **baja** y lo dice.
- **No alucina normas.** Todo criterio normativo sale de un catálogo tipado y
  versionado. Ningún componente —tampoco el LLM— puede citar una norma que no esté
  allí.
- **Cada hallazgo declara su procedencia**: *Regla verificable*, *Registro oficial*
  o *Análisis con IA*.
- **Todo lleva de vuelta a la fuente.** Cada contrato enlaza a su expediente en
  SECOP.

## Un hallazgo de transparencia, de paso

Construyendo esto encontramos algo que merece decirse: **el Estado colombiano
publica los datos de su contratación, pero no los documentos que los sustentan.**

| Vía intentada | Resultado |
|---|---|
| HTML de la página de proceso | Shell de SPA. Tres procesos distintos devuelven los mismos 20.927 bytes |
| API OCDS (`apiocds.colombiacompra.gov.co`) | **502 en todas las rutas**, incluida la raíz |
| Volcado OCDS del registro OCP | Cubre hasta **abril de 2022**, marcado *"no longer updated"* |
| Navegador automatizado | Título **`ReCaptcha`**; la única petición capturada es la traducción del propio captcha |
| Rutas públicas de listado | No existen: bajo `/Public/Archive/` solo vive `RetrieveFile` |

Las cifras son auditables; **los pliegos no**. Y el pliego es donde vive el
direccionamiento. Tekel lo resuelve pidiendo el documento al usuario —es público,
él sí puede descargarlo— y analizándolo al instante. No intentamos resolver ni
evadir el captcha: es un control de acceso deliberado del titular del sitio.

*Roadmap: descubrimiento automatizado por navegador headless o vía OCDS cuando CCE
restablezca el servicio. La descarga por identificador ya funciona.*

## Fuentes

| Fuente | Qué aporta |
|---|---|
| **SECOP II** — `jbjy-vk9h` | Contratos: valores, fechas, partes, estado |
| **SECOP II Procesos** — `p6dx-8zbt` | Presupuesto oficial, oferentes, adjudicación |
| **PACO** (`portal.paco.gov.co`) | Responsabilidades fiscales, SIRI, multas SECOP, colusiones SIC, Registro de Obras Inconclusas |
| **Croma** (`api.croma.run`) | RUES, Contraloría, Procuraduría, Contaduría, sanciones — verificación **viva**, no snapshot |
| **OpenRouter** | DeepSeek v3.2 (Capa B) y Qwen 3.7 Plus (Capa C) |

Las fuentes PACO son **fotos con fecha**; la verificación fresca es Croma en Capa C.
Todo cruce es **por número de documento exacto, nunca por nombre**: el nombre produce
homonimia y solo el documento admite confianza alta.

## Cómo correrlo

Los secretos viven en Infisical; todo comando que los necesite va con `infisical run`.
Sin Infisical: copia `env.example` a `.env.local`.

```bash
pnpm install

# Schema (la fuente de verdad es supabase/migrations/)
infisical run --env=dev -- supabase db push --yes

# 1. Verificar columnas del dataset — siempre primero
infisical run --env=dev -- pnpm ingest --inspect
infisical run --env=dev -- pnpm ingest --values departamento

# 2. Ingesta acotada
infisical run --env=dev -- pnpm ingest --departamento "Atlántico" --modo vigentes --max-rows 12000
infisical run --env=dev -- pnpm ingest --departamento "Atlántico" --modo historicos --desde 2023-01-01 --max-rows 8000
infisical run --env=dev -- pnpm ingest-processes

# 3. Snapshots forenses (descargar antes a data/paco/)
infisical run --env=dev -- pnpm load-paco --check   # valida el mapeo
infisical run --env=dev -- pnpm load-paco

# 4. Motor de reglas y triaje
infisical run --env=dev -- pnpm apply-rules

# 5. Capa B (tope de gasto configurable)
infisical run --env=dev -- pnpm enrich --limit 20 --show 3
infisical run --env=dev -- pnpm enrich --max-cost 5

# Expediente de un contrato en consola
infisical run --env=dev -- pnpm preview-expediente

# Prueba E2E: un contrato fuera del corpus atraviesa todas las capas
pnpm e2e-analisis --contrato CO1.PCCNTR.7171517

pnpm test      # 219 tests
pnpm dev
```

## Estructura

```
app/
  page.tsx              Dashboard con filtros
  contrato/[id]/        Expediente de Priorización
  api/
    contracts/          Listado con filtros · detalle con expediente
    analysis/[id]/      start · advance · upload  (máquina de estados)
lib/
  rules/                Capa A: 13 reglas puras, catálogo, umbrales, score, triaje
  normativa/catalog.ts  Criterio normativo — la pieza anti-alucinación
  analysis/engine.ts    Máquina de estados de la Capa C
  providers/            LLMProvider (OpenRouter) · ForensicProvider (Croma)
  expediente.ts         Ensamblado condición-criterio-efecto
scripts/                Ingesta, reglas, enrichment, sondeos (nunca en Vercel)
docs/METODOLOGIA.md     Especificación funcional — manda sobre el código
supabase/migrations/    Fuente de verdad del schema
```

## Metodología

La especificación funcional completa está en **[docs/METODOLOGIA.md](docs/METODOLOGIA.md)**:
catálogo de los 21 patrones con su criterio normativo, condiciones de exclusión,
modelo de priorización, controles de precisión y **límites declarados**.

Ante cualquier ambigüedad, manda ese documento sobre el código.

## Aviso legal

Tekel Agent señala **indicadores de riesgo** verificables en fuentes oficiales.
No constituye imputación, acusación ni prueba de responsabilidad. Los datos
provienen de fuentes públicas (Ley 1712 de 2014).
