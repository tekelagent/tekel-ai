"use client"

import { useState } from "react"
import { SlidersHorizontal, X } from "lucide-react"
import type { Filters } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PatternSelect } from "./pattern-select"

type Options = {
  departamentos: string[]
  ciudades: string[]
  tipos: string[]
  modalidades: string[]
}

type FiltersSidebarProps = {
  value: Filters
  onChange: (filters: Filters) => void
  options: Options
}

const PRIORIDADES: { key: string; label: string; dot: string }[] = [
  { key: "P1", label: "P1 — Crítico", dot: "var(--crit)" },
  { key: "P2", label: "P2 — Medio", dot: "var(--warn)" },
  { key: "P3", label: "P3 — Bajo", dot: "var(--p3)" },
]

const NIVELES: { key: string; label: string }[] = [
  { key: "critico", label: "Crítico" },
  { key: "medio", label: "Medio" },
  { key: "bajo", label: "Bajo" },
]

const ORDENES: { key: Filters["orden"]; label: string }[] = [
  { key: "prioridad", label: "Prioridad (P1 primero)" },
  { key: "plata", label: "Plata en riesgo" },
  { key: "score", label: "Score de riesgo" },
  { key: "fecha", label: "Fecha de firma" },
  { key: "valor", label: "Valor del contrato" },
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-eyebrow">{label}</span>
      {children}
    </div>
  )
}

function selectClass() {
  return "h-9 w-full rounded-xl border border-input bg-surface px-3 text-sm text-foreground outline-none transition-colors duration-150 hover:border-ring/60 focus:border-ring focus:ring-2 focus:ring-ring/30"
}

export function FiltersSidebar({ value, onChange, options }: FiltersSidebarProps) {
  const [open, setOpen] = useState(false)

  function set<K extends keyof Filters>(key: K, v: Filters[K]) {
    onChange({ ...value, [key]: v })
  }
  function toggleArr(key: "prioridad" | "risk_level", item: string) {
    const arr = value[key]
    set(key, arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item])
  }

  function clear() {
    onChange({
      ...value,
      prioridad: [],
      risk_level: [],
      departamento: "",
      ciudad: "",
      tipo: "",
      modalidad: "",
      valor_min: null,
      patrones: [],
      orden: "prioridad",
    })
  }

  const body = (
    <div className="flex flex-col gap-5">
      <Field label="Prioridad">
        <div className="flex flex-col gap-1.5">
          {PRIORIDADES.map((p) => (
            <label
              key={p.key}
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                checked={value.prioridad.includes(p.key)}
                onChange={() => toggleArr("prioridad", p.key)}
                className="size-4 accent-[var(--brand-via)]"
              />
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: p.dot }}
                aria-hidden="true"
              />
              {p.label}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Nivel de riesgo">
        <div className="flex flex-col gap-1.5">
          {NIVELES.map((n) => (
            <label
              key={n.key}
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                checked={value.risk_level.includes(n.key)}
                onChange={() => toggleArr("risk_level", n.key)}
                className="size-4 accent-[var(--brand-via)]"
              />
              {n.label}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Departamento">
        <select
          className={selectClass()}
          value={value.departamento}
          onChange={(e) => set("departamento", e.target.value)}
        >
          <option value="">Todos</option>
          {options.departamentos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Ciudad">
        <select
          className={selectClass()}
          value={value.ciudad}
          onChange={(e) => set("ciudad", e.target.value)}
        >
          <option value="">Todas</option>
          {options.ciudades.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Tipo de contrato">
        <select
          className={selectClass()}
          value={value.tipo}
          onChange={(e) => set("tipo", e.target.value)}
        >
          <option value="">Todos</option>
          {options.tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Modalidad">
        <select
          className={selectClass()}
          value={value.modalidad}
          onChange={(e) => set("modalidad", e.target.value)}
        >
          <option value="">Todas</option>
          {options.modalidades.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Valor mínimo (COP)">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1000000}
          value={value.valor_min ?? ""}
          onChange={(e) => set("valor_min", e.target.value === "" ? null : Number(e.target.value))}
          placeholder="Sin mínimo"
          className={cn(selectClass(), "num tabular-nums")}
        />
      </Field>

      <Field label="Patrones">
        <PatternSelect selected={value.patrones} onChange={(p) => set("patrones", p)} />
      </Field>

      <Field label="Ordenar por">
        <select
          className={selectClass()}
          value={value.orden}
          onChange={(e) => set("orden", e.target.value as Filters["orden"])}
        >
          {ORDENES.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Button variant="outline" size="sm" onClick={clear} className="w-full">
        Limpiar filtros
      </Button>
    </div>
  )

  return (
    <>
      {/* Disparador móvil */}
      <div className="lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <SlidersHorizontal className="size-4" />
          Filtros
        </Button>
      </div>

      {/* Sidebar de escritorio */}
      <aside className="hidden w-[260px] shrink-0 lg:block">
        <div className="card-soft sticky top-[84px] p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Filtros</h2>
          {body}
        </div>
      </aside>

      {/* Drawer móvil */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 h-full w-[85%] max-w-[320px] overflow-y-auto border-r border-hairline bg-surface p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Filtros</h2>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Cerrar filtros">
                <X className="size-4" />
              </Button>
            </div>
            {body}
          </div>
        </div>
      )}
    </>
  )
}
