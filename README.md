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

## Orden de ejecución

Los secretos viven en Infisical (proyecto `tekelagent`, entorno `dev`), así que
todo comando que los necesite se lanza con `infisical run --env=dev -- <cmd>`.
Sin Infisical: copia `env.example` a `.env.local` y llena las llaves.

1. **Deps**:
   ```bash
   pnpm install
   ```
2. **Schema**: se aplica por CLI desde `supabase/migrations/`, que es la fuente
   de verdad. No se pega nada en el SQL Editor del Dashboard;
   `supabase/schema.sql` es solo documentación legible.
   ```bash
   infisical run --env=dev -- supabase db push --yes
   ```
   Para cambiarlo: `supabase migration new <nombre>`, escribe el ALTER, `db push`.
3. **Verifica columnas reales del dataset** (¡siempre primero!):
   ```bash
   infisical run --env=dev -- pnpm ingest --inspect
   infisical run --env=dev -- pnpm ingest --values departamento
   infisical run --env=dev -- pnpm ingest --values estado_contrato
   ```
   Si algún nombre difiere, ajusta el mapa `COL` al inicio de `scripts/ingest.ts`.
4. **Ingesta** (Atlántico vigentes + históricos; Bogotá para contraste):
   ```bash
   infisical run --env=dev -- pnpm ingest --departamento "Atlántico" --modo vigentes --max-rows 12000
   infisical run --env=dev -- pnpm ingest --departamento "Atlántico" --modo historicos --desde 2023-01-01 --max-rows 8000
   infisical run --env=dev -- pnpm ingest --departamento "Distrito Capital de Bogotá" --modo vigentes --max-rows 5000
   ```

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
