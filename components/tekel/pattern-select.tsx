"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import { PATTERNS } from "@/lib/patterns"
import { cn } from "@/lib/utils"

type PatternSelectProps = {
  selected: string[]
  onChange: (codes: string[]) => void
}

const ALL = Object.entries(PATTERNS).map(([code, info]) => ({ code, label: info.label }))

export function PatternSelect({ selected, onChange }: PatternSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const filtered = ALL.filter((p) =>
    p.label.toLowerCase().includes(query.trim().toLowerCase()),
  )

  function toggle(code: string) {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code])
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-hairline bg-surface px-2.5 text-sm transition-colors duration-150 hover:border-ring/60"
      >
        <span className={selected.length ? "text-foreground" : "text-muted-foreground"}>
          {selected.length ? `${selected.length} seleccionados` : "Todos los patrones"}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-full min-w-64 overflow-hidden rounded-md border border-hairline bg-surface shadow-lg">
          <div className="relative border-b border-hairline">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar patrón…"
              className="h-9 w-full bg-transparent pl-8 pr-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul role="listbox" aria-label="Patrones" className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">Sin coincidencias</li>
            )}
            {filtered.map((p) => {
              const active = selected.includes(p.code)
              return (
                <li key={p.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => toggle(p.code)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-hairline",
                      )}
                    >
                      {active && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="text-foreground">{p.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
