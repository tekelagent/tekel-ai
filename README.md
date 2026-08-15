# Tekel Agent

> *"MENE, MENE, TEKEL: pesado en la balanza y hallado falto."* — Daniel 5

Plataforma de auditoría inteligente de contratación pública colombiana (SECOP II).
Pesa cada contrato en la balanza: reglas deterministas + IA + verificación forense
en registros oficiales (Croma), sobre **contratos en ejecución** (plata en riesgo hoy)
y **contratos históricos** (evidencia accionable para entes de control).

## Arquitectura

```
 datos.gov.co (Socrata)          Croma API              OpenRouter (LLMs)
 SECOP II jbjy-vk9h          RUES · SIRI · SIBOR      DeepSeek / GLM / Kimi
        │                    contratos x proveedor            │
        ▼                           │                         │
  scripts/ingest.ts                 │                         │
        │                           │                         │
        ▼                           ▼                         ▼
 ┌─────────────────────────── SUPABASE ────────────────────────────┐
 │  contracts (miles de filas, modo vigente/histórico)             │
 │  findings  (Capa A reglas · Capa B LLM barato · Capa C Croma)   │
 │  deep_analyses (análisis profundo on-click, cacheado)           │
 └───────────────────────────────┬─────────────────────────────────┘
                                 ▼
                    Next.js (Vercel) — dashboard con filtros
```

**3 capas de costo creciente:**
- **Capa A — Reglas ($0):** patrones deterministas sobre datos estructurados.
- **Capa B — LLM batch (~$0.0004/contrato):** coherencia semántica + resumen de riesgo.
- **Capa C — Profundo on-click:** forense Croma en vivo + análisis de pliego (PDF) con citas.

## Orden de ejecución (Paso 1)

1. **Schema**: Supabase Dashboard → SQL Editor → pegar `supabase/schema.sql` → Run.
2. **Env**: copia `env.example` a `.env.local` y llena las llaves.
3. **Deps** (dentro del repo, tras scaffold de Next.js o export de v0):
   ```bash
   pnpm add @supabase/supabase-js
   pnpm add -D tsx typescript @types/node
   ```
4. **Verifica columnas reales del dataset** (¡siempre primero!):
   ```bash
   pnpm tsx scripts/ingest.ts --inspect
   pnpm tsx scripts/ingest.ts --values departamento
   pnpm tsx scripts/ingest.ts --values estado_contrato
   ```
   Si algún nombre difiere, ajusta el mapa `COL` al inicio de `scripts/ingest.ts`.
5. **Ingesta** (Atlántico vigentes + históricos 5 años; Bogotá para contraste):
   ```bash
   pnpm tsx scripts/ingest.ts --departamento "Atlántico" --modo vigentes
   pnpm tsx scripts/ingest.ts --departamento "Atlántico" --modo historicos --desde 2021-08-15 --max-rows 8000
   pnpm tsx scripts/ingest.ts --departamento "Distrito Capital de Bogotá" --modo vigentes --max-rows 5000
   ```
   (El nombre exacto de Bogotá confírmalo con `--values departamento`.)

## Estructura del repo

```
app/            # Next.js App Router (UI + route handlers)
lib/
  schemas.ts    # Schemas zod compartidos
  rules/        # Capa A: motor de reglas
  providers/
    llm.ts      # LLMProvider (OpenRouter, OpenAI-compatible)
    forensic/   # ForensicProvider: croma.ts + mock.ts (fixtures)
scripts/
  ingest.ts     # Socrata → Supabase (este paso)
  enrich.ts     # Capa B batch (Paso 2)
supabase/
  schema.sql
CLAUDE.md       # Convenciones para Claude Code — leer primero
```

## Aviso legal

Tekel Agent señala **indicadores de riesgo** verificables en fuentes oficiales.
No constituye imputación, acusación ni prueba de responsabilidad. Los datos
provienen de fuentes públicas (Ley 1712 de 2014).
