# CLAUDE.md — Tekel Agent

Contexto para Claude Code. Leer completo antes de escribir código.

## Qué es esto

Hackathon (Track: Tecnología para la Transparencia), <20h, un solo dev.
Tekel Agent audita contratación pública colombiana (SECOP II) en dos modos:
- **Vigilancia activa** (`vigencia = 'vigente'`): contratos en ejecución — plata en riesgo HOY. Modo por defecto de la UI.
- **Auditoría histórica** (`vigencia = 'historico'`): contratos terminados/liquidados — evidencia accionable para entes de control (ventana por defecto: últimos 5 años).

El jurado usará la app libremente: debe poder filtrar (departamento, ciudad,
tipo, modalidad, valor, fechas, nivel de riesgo, patrones) y hacer clic en
CUALQUIER contrato para disparar análisis profundo en vivo.

Criterios de evaluación (100 pts): Impacto público 25 · Uso real de IA 25 ·
Demo funcional 20 · Viabilidad 15 · Ejecución técnica + UX 15.

## Stack

- Next.js App Router + TypeScript + Tailwind + shadcn/ui. Deploy: Vercel.
- Supabase (Postgres). Acceso SOLO server-side con `SUPABASE_SERVICE_ROLE_KEY`.
- LLMs vía OpenRouter (API OpenAI-compatible, base URL `https://openrouter.ai/api/v1`).
  - Capa B (batch barato): `TEKEL_LLM_BULK_MODEL` (default deepseek/deepseek-v3.2).
  - Capa C (razonamiento profundo): `TEKEL_LLM_DEEP_MODEL`.
- Forense: Croma API (docs.usecroma.com) detrás de `ForensicProvider`.
- Scripts batch corren con `tsx` desde terminal local, NUNCA en funciones Vercel (timeouts).

## Arquitectura de 3 capas

- **Capa A — rules (`lib/rules/`)**: puras, deterministas, testeables. Entrada: fila de `contracts`. Salida: `Finding[]`. Costo $0.
- **Capa B — enrich (`scripts/enrich.ts`)**: LLM barato por lote sobre campos estructurados. Produce `resumen_riesgo` + findings semánticos.
- **Capa C — deep (route handler + `deep_analyses`)**: on-click. Croma en vivo (RUES por NIT, antecedentes del representante, contratos-por-proveedor, sanciones) + LLM profundo que consolida narrativa. Si hay PDF del pliego: análisis pliego-sastre con citas textuales + página. Resultado se cachea en `deep_analyses` (segundo clic = instantáneo y $0).

## Patrones, priorización y criterio normativo

**La fuente de verdad es [docs/METODOLOGIA.md](docs/METODOLOGIA.md). Ante cualquier
ambigüedad, manda ese documento.** No dupliques aquí la tabla de patrones: si los
pesos, umbrales o condiciones de exclusión cambian, cambian allá.

Lo que hay que leer antes de tocar el motor:

- **§3 Catálogo de patrones** — los 16 `pattern_code` con su capa, foco, puntos y
  criterio normativo, más las condiciones de exclusión y confianza de la Capa A.
- **§4 Modelo de priorización** — score (Σ puntos, tope 100; 0-29 bajo, 30-64
  medio, 65+ crítico) y triaje P1/P2/P3 con materialidad y corroboración.
- **§5 Expediente de Priorización** — la salida por contrato, en formato
  condición-criterio-efecto.
- **§6 Controles de precisión** — abstención sobre invención, anti-alucinación
  normativa, calibración esperada (~1-3% crítico).
- **§7 Límites declarados** — lo que Tekel explícitamente NO hace.

Dónde vive cada cosa en el código:

| Concepto de METODOLOGIA | Implementación |
|---|---|
| §3 pesos y metadatos de patrones | `lib/rules/catalog.ts` |
| §3 criterio normativo por patrón | `lib/normativa/catalog.ts` |
| §3 umbrales y condiciones de exclusión | `lib/rules/thresholds.ts` |
| §3 una regla determinista | `lib/rules/<regla>.ts` |
| §4 score y niveles | `lib/rules/score.ts` |
| §4 triaje y "por qué ahora" | `lib/rules/priority.ts` |
| §5 expediente | `lib/expediente.ts` |

En modo vigente, la UI ordena por prioridad y destaca `plata_en_riesgo`
(lo aún recuperable). En modo histórico, agrupa por proveedor/entidad
(redes) y muestra totales.

## Convenciones

- Schemas zod compartidos en `lib/schemas.ts`; toda salida LLM se valida con zod (structured output). Si falla el parse: 1 retry con el error en el prompt, luego se registra y se omite.
- Adapters: `LLMProvider` y `ForensicProvider` (interfaz + impl `croma.ts` + `mock.ts` con fixtures reales etiquetadas "datos de muestra"). Cambiar de modelo/proveedor = variable de entorno.
- Llaves API solo en env server-side. Nada de llaves en el cliente. `.env.local` en .gitignore; `env.example` versionado.
- Copys de UI en español. Código e identificadores en inglés.
- Commits pequeños con prefijo: `feat:`, `fix:`, `chore:`, `docs:`.
- Errores de APIs externas: retry con backoff (máx 3), luego degradar con mensaje claro en UI — nunca romper la página.
- Cada contrato muestra siempre el link `url_proceso` a SECOP: "verificable en la fuente".

## Datos

- Fuente bulk: datos.gov.co Socrata, dataset `jbjy-vk9h` (SECOP II Contratos).
  Docs de columnas: https://dev.socrata.com/foundry/www.datos.gov.co/jbjy-vk9h
- Antes de tocar el mapeo: `pnpm tsx scripts/ingest.ts --inspect` y `--values <col>`.
  Los nombres de columna viven SOLO en `scripts/ingest.ts` (mapa COL + mapRow).
- `contracts.raw` guarda la fila original completa: nuevas reglas pueden minarla sin re-ingestar.

## Ética (obligatorio en UI)

Footer y detalle de contrato incluyen: "Tekel Agent señala indicadores de
riesgo verificables en fuentes oficiales. No constituye imputación ni
acusación." Nunca generar texto que afirme culpabilidad de personas o empresas.

## No-goals del MVP (roadmap en README, no programar)

Alertas WhatsApp/email, ingestión masiva de PDFs con OCR, embeddings para
copy-paste de estudios previos, exportación PDF de reportes, multi-país.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
