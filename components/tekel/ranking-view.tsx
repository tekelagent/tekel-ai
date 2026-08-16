"use client"

import { useState } from "react"
import Link from "next/link"
import { Building2, Map } from "lucide-react"
import type { GroupRanking } from "@/lib/aggregate"
import { abbreviateCOP, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

type Tab = "entidad" | "departamento"

function riskDotColor(score: number | null) {
  if (score == null) return "var(--p3)"
  if (score >= 60) return "var(--crit)"
  if (score >= 35) return "var(--warn)"
  return "var(--ok)"
}

function RankingTable({ rows, unit }: { rows: GroupRanking[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.plataEnRiesgo))

  return (
    <div className="card-soft overflow-hidden">
      <div className="grid grid-cols-[2.5rem_1fr_6rem_9rem_9rem] gap-3 border-b border-hairline bg-muted/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <span>#</span>
        <span>{unit}</span>
        <span className="text-right">Contratos</span>
        <span className="text-right">Valor total</span>
        <span className="text-right">Plata en riesgo</span>
      </div>
      <ol>
        {rows.map((r, i) => (
          <li
            key={r.key}
            className="grid grid-cols-[2.5rem_1fr_6rem_9rem_9rem] items-center gap-3 border-b border-hairline px-5 py-3.5 last:border-b-0"
          >
            <span className="num text-sm font-semibold text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{r.label}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 max-w-40 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, (r.plataEnRiesgo / max) * 100)}%`,
                      backgroundColor: riskDotColor(r.scorePromedio),
                    }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {r.criticos} {r.criticos === 1 ? "crítico" : "críticos"}
                </span>
              </div>
            </div>
            <span className="num text-right text-sm tabular-nums text-foreground">
              {formatNumber(r.contratos)}
            </span>
            <span className="num text-right text-sm font-medium tabular-nums text-foreground">
              {abbreviateCOP(r.valorTotal)}
            </span>
            <span
              className="num text-right text-sm font-semibold tabular-nums"
              style={{ color: r.plataEnRiesgo > 0 ? "var(--crit)" : "var(--muted-foreground)" }}
            >
              {r.plataEnRiesgo > 0 ? abbreviateCOP(r.plataEnRiesgo) : "—"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function RankingView({
  porEntidad,
  porDepartamento,
}: {
  porEntidad: GroupRanking[]
  porDepartamento: GroupRanking[]
}) {
  const [tab, setTab] = useState<Tab>("entidad")

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        Volver al panel
      </Link>

      <span className="badge-pill border border-hairline bg-surface text-muted-foreground">
        Insumo para investigación
      </span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground text-balance md:text-4xl">
        Ranking de riesgo <span className="text-gradient">por entidad y territorio</span>
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
        Ordenado por plata en riesgo acumulada. Útil para identificar qué entidades o
        departamentos concentran más contratos que merecen veeduría, un buen punto de partida
        para un reportaje o una solicitud de información.
      </p>

      <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-hairline bg-surface p-1 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.15)]">
        <button
          type="button"
          onClick={() => setTab("entidad")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150",
            tab === "entidad"
              ? "bg-brand-gradient text-white shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Building2 className="size-3.5" aria-hidden="true" />
          Entidades
        </button>
        <button
          type="button"
          onClick={() => setTab("departamento")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150",
            tab === "departamento"
              ? "bg-brand-gradient text-white shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Map className="size-3.5" aria-hidden="true" />
          Departamentos
        </button>
      </div>

      <div className="mt-5">
        {tab === "entidad" ? (
          <RankingTable rows={porEntidad} unit="Entidad" />
        ) : (
          <RankingTable rows={porDepartamento} unit="Departamento" />
        )}
      </div>
    </div>
  )
}
