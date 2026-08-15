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

## Patrones y pesos (motor de scoring)

`risk_score = min(100, Σ points)` · Niveles: 0-29 bajo · 30-64 medio · 65+ crítico.
La IA ENCUENTRA hallazgos; el motor PONDERA con estos pesos fijos (auditable):

| pattern_code            | Capa  | Pesa más en | Pts | Descripción corta                                              |
|-------------------------|-------|-------------|-----|----------------------------------------------------------------|
| INHABILIDAD_REP_LEGAL   | Croma | ambos       | 45  | Antecedente fiscal/disciplinario vigente del representante      |
| PROVEEDOR_RECIENTE      | Croma | ambos       | 40  | Empresa <90 días y/o capital mínimo vs cuantía                  |
| ADICIONES_50            | A     | histórico   | 40  | Adiciones acumuladas >50% del valor inicial (Ley 80 art. 40)    |
| FRACCIONAMIENTO         | A     | ambos       | 30  | Contratos pequeños repetidos, mismo proveedor+entidad+objeto    |
| PLIEGO_SASTRE           | C-LLM | ambos       | 25  | Ficha técnica que restringe competencia (cita textual + página) |
| DESEQUILIBRIO_PAGOS     | A     | vigente     | 25  | % pagado ≫ % de tiempo transcurrido del contrato                |
| PLAZO_RELAMPAGO         | C-LLM | vigente     | 25  | Ventana de ofertas <3 días hábiles en alta cuantía              |
| SANCIONES_PREVIAS       | Croma | ambos       | 25  | Sanciones previas del proveedor en SECOP                        |
| CONCENTRACION_PROVEEDOR | A     | histórico   | 20  | Mismo NIT acumula N contratos con la misma entidad              |
| OBJETO_CIIU_INCOHERENTE | Croma | ambos       | 20  | Actividad RUES sin relación con el objeto contratado            |
| PAGO_ADELANTADO_RIESGO  | A     | vigente     | 10  | Anticipo habilitado (sube a 30 si proveedor reciente)           |
| DICIEMBRE               | A     | histórico   | 10  | Firma en diciembre (quema de presupuesto)                       |
| OBJETO_DIFUSO           | B-LLM | ambos       | 10  | Objeto contractual vago/genérico para la cuantía                |

En modo vigente, la UI ordena por score y destaca `valor_pendiente_ejecucion`
(la plata aún recuperable). En modo histórico, agrupa por proveedor/entidad
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
