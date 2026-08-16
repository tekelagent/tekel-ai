"use client"

import { useState } from "react"
import { SearchX } from "lucide-react"
import type { Contract, Filters } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ContractCard } from "./contract-card"

type ContractListProps = {
  contracts: Contract[]
  modo: Filters["modo"]
  patronesByContract: Record<string, string[]>
  pageSize?: number
  loading?: boolean
}

export function CardSkeleton() {
  return (
    <div className="card-soft flex gap-4 p-5 pl-6">
      <div className="size-[46px] shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 space-y-2.5">
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-input bg-surface/70 px-6 py-16 text-center">
      <span className="icon-tile bg-brand-gradient size-12">
        <SearchX className="size-6" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">
          Ningún contrato coincide con los filtros
        </p>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Ajusta la prioridad, el nivel de riesgo o limpia los filtros para ver más
          resultados del corpus.
        </p>
      </div>
    </div>
  )
}

export function ContractList({
  contracts,
  modo,
  patronesByContract,
  pageSize = 6,
  loading = false,
}: ContractListProps) {
  const [visible, setVisible] = useState(pageSize)

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (contracts.length === 0) return <EmptyState />

  const shown = contracts.slice(0, visible)
  const remaining = contracts.length - shown.length

  return (
    <div className="flex flex-col gap-3">
      {shown.map((c) => (
        <ContractCard
          key={c.id_contrato}
          contract={c}
          modo={modo}
          patrones={patronesByContract[c.id_contrato] ?? []}
        />
      ))}

      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => setVisible((v) => v + pageSize)}
            className="num rounded-full px-6"
          >
            Cargar más ({remaining} restantes)
          </Button>
        </div>
      )}
    </div>
  )
}
