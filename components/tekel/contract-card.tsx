import Link from "next/link"
import { AlertTriangle, ArrowUpRight, Building2, CheckCircle2, Landmark, Wallet } from "lucide-react"
import type { Contract, Filters } from "@/lib/types"
import { abbreviateCOP, formatDateShort } from "@/lib/format"
import { priorityTone, riskColor } from "./meta"
import { ScoreRing } from "./score-ring"
import { PatternChips } from "./pattern-chips"

type ContractCardProps = {
  contract: Contract
  modo: Filters["modo"]
  /** Códigos de patrón detectados; se muestran como chips legibles (máx. 3). */
  patrones?: string[]
}

export function ContractCard({ contract: c, modo, patrones = [] }: ContractCardProps) {
  const tone = priorityTone(c.prioridad)
  const color = riskColor(c.risk_level)
  const primaryReason = c.porque_ahora[0]
  // La etiqueta dice de dónde sale la cifra. Sin rastro de pagos es el valor
  // total del contrato, no un pendiente confirmado, y no debe leerse igual.
  const riesgoLabel =
    modo === "historico"
      ? "Pagado bajo revisión"
      : c.plata_procedencia === "sin_rastro"
        ? "Sin rastro de pagos"
        : "Plata en riesgo"

  return (
    <Link
      href={`/contrato/${encodeURIComponent(c.id_contrato)}`}
      className="card-soft group relative flex flex-col overflow-hidden p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_48px_-18px_rgba(15,23,42,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {/* Resplandor superior de color según riesgo */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-24 opacity-[0.07]"
        style={{ background: `radial-gradient(60% 100% at 15% 0%, ${color}, transparent 70%)` }}
      />

      <div className="relative flex items-start gap-4">
        {/* Score */}
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="rounded-full p-1.5"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}
          >
            <ScoreRing score={c.risk_score} color={color} size={48} stroke={4.5} />
          </div>
          {c.prioridad && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.text} ${tone.bg}`}
            >
              {c.prioridad}
            </span>
          )}
        </div>

        {/* Cuerpo */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-foreground">
                <Landmark className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{c.nombre_entidad}</span>
              </h3>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{c.proveedor}</span>
              </p>
            </div>

            <ArrowUpRight
              className="size-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
              aria-hidden="true"
            />
          </div>

          <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-foreground/85">
            {c.objeto}
          </p>
        </div>
      </div>

      {/* Franja de cifras */}
      <div className="relative mt-4 grid grid-cols-2 gap-2.5 rounded-xl bg-muted/60 p-3">
        <div className="flex items-center gap-2">
          <span className="bg-brand-gradient flex size-8 shrink-0 items-center justify-center rounded-lg text-white">
            <Wallet className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="label-eyebrow leading-none">Valor</p>
            <p className="num truncate text-sm font-semibold tabular-nums text-foreground">
              {abbreviateCOP(c.valor_contrato)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-l border-hairline pl-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: c.plata_en_riesgo ? color : "var(--p3)" }}
          >
            <AlertTriangle className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="label-eyebrow leading-none">{riesgoLabel}</p>
            <p
              className="num truncate text-sm font-semibold tabular-nums"
              style={{ color: c.plata_en_riesgo ? color : "var(--muted-foreground)" }}
            >
              {c.plata_en_riesgo ? abbreviateCOP(c.plata_en_riesgo) : "—"}
            </p>
          </div>
        </div>
      </div>

      {c.plata_procedencia === "corroborado" && c.pagos_filas ? (
        <div className="relative mt-3 inline-flex items-center gap-1.5 self-start rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 text-[11px] font-medium text-ok">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          Contrastado con el plan de pagos de SECOP · {c.pagos_filas}{" "}
          {c.pagos_filas === 1 ? "factura" : "facturas"}
        </div>
      ) : null}

      {c.valor_verificar && (
        <div className="relative mt-3 inline-flex items-center gap-1.5 self-start rounded-full border border-warn/30 bg-warn-soft px-2.5 py-1 text-[11px] font-medium text-warn">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          Valor reportado inverosímil — verificar en fuente
        </div>
      )}

      <div className="relative mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {patrones.length > 0 ? <PatternChips codes={patrones} /> : <span />}
        <span className="num shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatDateShort(c.fecha_firma)}
        </span>
      </div>

      {primaryReason && (
        <p className="relative mt-3 border-t border-hairline pt-3 text-xs italic leading-relaxed text-muted-foreground">
          {primaryReason}
        </p>
      )}
    </Link>
  )
}
