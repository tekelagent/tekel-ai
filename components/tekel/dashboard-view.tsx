"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { Contract, Filters } from "@/lib/types"
import { abbreviateCOP, formatNumber } from "@/lib/format"
import { MetricBand } from "./metric-band"
import { SearchHero } from "./search-hero"
import { ModeToggle } from "./mode-toggle"
import { FiltersSidebar } from "./filters-sidebar"
import { ContractList } from "./contract-list"

function HeroSection() {
  return (
    <section className="flex flex-col items-center gap-5 pt-10 text-center">
      <span className="badge-pill border border-hairline bg-surface text-muted-foreground shadow-[0_4px_14px_-8px_rgba(15,23,42,0.15)]">
        <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" />
        Auditoría forense de contratación pública — Colombia
      </span>
      <h1 className="max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-foreground text-balance md:text-5xl">
        Cada contrato del Estado, <span className="text-gradient">auditado automáticamente</span>
      </h1>
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground text-pretty md:text-lg">
        Tekel audita todo el universo de SECOP II automáticamente y te entrega los casos que
        merecen tu tiempo hoy, mientras la plata todavía no ha salido. Señala indicadores
        verificables — nunca acusa.
      </p>
    </section>
  )
}

type Metrics = {
  contratos_vigilados: number
  plata_en_riesgo_p1: number
  por_salir_p1: number
  contratos_criticos: number
  hallazgos: number
}

type DashboardViewProps = {
  contracts: Contract[]
  patronesByContract: Record<string, string[]>
  metrics: Metrics
}

const INITIAL: Filters = {
  q: "",
  modo: "vigente",
  prioridad: [],
  risk_level: [],
  departamento: "",
  ciudad: "",
  tipo: "",
  modalidad: "",
  valor_min: null,
  patrones: [],
  orden: "prioridad",
}

/** P1 antes que P2, P2 antes que P3, sin triaje al final. */
const RANGO_PRIORIDAD: Record<string, number> = { P1: 0, P2: 1, P3: 2 }

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "es"))
}

export function DashboardView({ contracts, patronesByContract, metrics }: DashboardViewProps) {
  const router = useRouter()
  const [filters, setFilters] = useState<Filters>(INITIAL)
  const [notFound, setNotFound] = useState<string | undefined>(undefined)

  const options = useMemo(
    () => ({
      departamentos: uniqueSorted(contracts.map((c) => c.departamento)),
      ciudades: uniqueSorted(contracts.map((c) => c.ciudad)),
      tipos: uniqueSorted(contracts.map((c) => c.tipo_de_contrato)),
      modalidades: uniqueSorted(contracts.map((c) => c.modalidad)),
    }),
    [contracts],
  )

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    const list = contracts.filter((c) => {
      if (c.vigencia !== filters.modo) return false
      if (q) {
        const hay =
          c.id_contrato.toLowerCase().includes(q) ||
          c.nombre_entidad.toLowerCase().includes(q) ||
          c.proveedor.toLowerCase().includes(q)
        if (!hay) return false
      }
      if (filters.prioridad.length && !filters.prioridad.includes(c.prioridad ?? "")) return false
      if (filters.risk_level.length && !filters.risk_level.includes(c.risk_level ?? "")) return false
      if (filters.departamento && c.departamento !== filters.departamento) return false
      if (filters.ciudad && c.ciudad !== filters.ciudad) return false
      if (filters.tipo && c.tipo_de_contrato !== filters.tipo) return false
      if (filters.modalidad && c.modalidad !== filters.modalidad) return false
      if (filters.valor_min != null && c.valor_contrato < filters.valor_min) return false
      if (filters.patrones.length) {
        const codes = patronesByContract[c.id_contrato] ?? []
        if (!filters.patrones.some((p) => codes.includes(p))) return false
      }
      return true
    })

    const sorted = [...list].sort((a, b) => {
      switch (filters.orden) {
        case "prioridad": {
          const ra = RANGO_PRIORIDAD[a.prioridad ?? ""] ?? 9
          const rb = RANGO_PRIORIDAD[b.prioridad ?? ""] ?? 9
          if (ra !== rb) return ra - rb
          return (b.plata_en_riesgo ?? 0) - (a.plata_en_riesgo ?? 0)
        }
        case "plata":
          // Por lo facturado y no pagado, no por `plata_en_riesgo`: en el 76%
          // de los vigentes esa cifra es el valor del contrato, así que
          // ordenar por ella era ordenar por tamaño del contrato.
          return (b.pagos_en_tramite ?? 0) - (a.pagos_en_tramite ?? 0)
        case "score":
          return (b.risk_score ?? 0) - (a.risk_score ?? 0)
        case "valor":
          return b.valor_contrato - a.valor_contrato
        case "fecha":
          return b.fecha_firma.localeCompare(a.fecha_firma)
        default:
          return 0
      }
    })
    return sorted
  }, [contracts, filters, patronesByContract])

  function handleSearch(q: string) {
    setFilters((f) => ({ ...f, q }))
    const looksLikeSecop = /^co1\.pccntr/i.test(q.trim())
    const exists = contracts.some((c) => c.id_contrato.toLowerCase() === q.trim().toLowerCase())
    setNotFound(looksLikeSecop && !exists ? q.trim() : undefined)
  }

  const plataLabel =
    filters.modo === "historico" ? "Valor pagado bajo revisión" : "Por salir en P1"

  // En vigente se muestra lo facturado y aprobado que aún no ha salido, no la
  // suma de los valores de contrato: es la cifra que tiene una factura detrás
  // y que todavía se puede detener.
  const plataValor =
    filters.modo === "historico" ? metrics.plata_en_riesgo_p1 : metrics.por_salir_p1

  const metricList = [
    { label: "Contratos vigilados", value: formatNumber(metrics.contratos_vigilados) },
    { label: plataLabel, value: abbreviateCOP(plataValor), tone: "crit" as const },
    { label: "Contratos críticos", value: formatNumber(metrics.contratos_criticos), tone: "crit" as const },
    { label: "Hallazgos", value: formatNumber(metrics.hallazgos) },
  ]

  return (
    <div className="flex flex-col gap-10">
      <HeroSection />

      <div className="flex flex-col gap-4">
        <SearchHero
          onSearch={handleSearch}
          notFoundSecopId={notFound}
          onAnalyzeLive={(id) => router.push(`/analizar/${encodeURIComponent(id)}`)}
        />
      </div>

      <MetricBand metrics={metricList} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ModeToggle
          value={filters.modo}
          onChange={(modo) => setFilters((f) => ({ ...f, modo }))}
        />
        <p className="num text-sm text-muted-foreground tabular-nums">
          {formatNumber(filtered.length)}{" "}
          {filtered.length === 1 ? "contrato" : "contratos"} en vista
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <FiltersSidebar value={filters} onChange={setFilters} options={options} />
        <div className="min-w-0 flex-1">
          <ContractList
            contracts={filtered}
            modo={filters.modo}
            patronesByContract={patronesByContract}
          />
        </div>
      </div>
    </div>
  )
}
