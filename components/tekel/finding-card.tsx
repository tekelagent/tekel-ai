"use client"

import { useState } from "react"
import { Calculator, ChevronDown, Landmark, Sparkles } from "lucide-react"
import type { Finding } from "@/lib/types"
import { patternLabel } from "@/lib/patterns"
import { cn } from "@/lib/utils"
import { formatCOP, formatNumber } from "@/lib/format"
import { confianzaLabel, focoLabel, severityColor, sourceLabel } from "./meta"

/** Da formato legible a los valores de evidencia según el nombre de la clave. */
function formatEvidence(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Sí" : "No"
  if (typeof value !== "number") return String(value)

  const k = key.toLowerCase()
  if (k.includes("pct") || k.includes("porcentaje") || k.endsWith("_pp")) {
    return `${formatNumber(value)}%`
  }
  // Claves monetarias típicas o cifras grandes (> 1 millón) en pesos.
  if (
    /valor|monto|adicion|anticipo|pago|precio|cuantia|presupuesto/.test(k) ||
    Math.abs(value) >= 1_000_000
  ) {
    return formatCOP(value)
  }
  return formatNumber(value)
}

function SourceIcon({ source }: { source: Finding["source"] }) {
  const cls = "size-4 text-muted-foreground"
  if (source === "rules") return <Calculator className={cls} aria-hidden="true" />
  if (source === "llm") return <Sparkles className={cls} aria-hidden="true" />
  return <Landmark className={cls} aria-hidden="true" />
}

function badge(text: string) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {text}
    </span>
  )
}

export function FindingCard({ finding: f }: { finding: Finding }) {
  const [open, setOpen] = useState(false)
  const color = severityColor(f.severity)

  return (
    <div className="card-soft relative overflow-hidden">
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-full w-1.5"
        style={{ backgroundColor: color }}
      />
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 py-3.5 pl-5 pr-4 text-left"
      >
        <SourceIcon source={f.source} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            {patternLabel(f.pattern_code)}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {badge(confianzaLabel(f.confianza))}
            {badge(focoLabel(f.foco))}
            <span className="text-[11px] text-muted-foreground">{sourceLabel(f.source)}</span>
          </span>
        </span>
        <span
          className="num shrink-0 text-sm font-semibold tabular-nums"
          style={{ color }}
        >
          +{f.points}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-hairline py-4 pl-5 pr-4">
          <p className="text-sm leading-relaxed text-foreground/90 text-pretty">{f.detail}</p>

          <div className="mt-4 overflow-hidden rounded-xl border border-hairline">
            <table className="w-full font-mono text-xs">
              <tbody>
                {Object.entries(f.evidence).map(([k, v], i) => (
                  <tr key={k} className={i % 2 ? "bg-canvas" : "bg-surface"}>
                    <td className="w-1/2 border-r border-hairline px-3 py-1.5 text-muted-foreground">
                      {k}
                    </td>
                    <td className="num px-3 py-1.5 tabular-nums text-foreground">
                      {formatEvidence(k, v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">Criterio: {f.norma}</p>
        </div>
      )}
    </div>
  )
}
