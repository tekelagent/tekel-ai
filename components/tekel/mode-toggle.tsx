"use client"

import { cn } from "@/lib/utils"
import type { Filters } from "@/lib/types"

type ModeToggleProps = {
  value: Filters["modo"]
  onChange: (mode: Filters["modo"]) => void
}

const OPTIONS: { key: Filters["modo"]; label: string }[] = [
  { key: "vigente", label: "Vigilancia activa" },
  { key: "historico", label: "Auditoría histórica" },
]

export function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Modo de vigilancia"
      className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface p-1 shadow-[0_4px_14px_-8px_rgba(15,23,42,0.15)]"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150",
              active
                ? "bg-brand-gradient text-white shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
