"use client"

import { useState } from "react"
import { Search, FileSearch, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

type SearchHeroProps = {
  onSearch?: (q: string) => void
  /** ID de SECOP buscado que no está en el corpus; muestra la card de análisis en vivo. */
  notFoundSecopId?: string
  onAnalyzeLive?: (id: string) => void
}

export function SearchHero({ onSearch, notFoundSecopId, onAnalyzeLive }: SearchHeroProps) {
  const [value, setValue] = useState("")

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSearch?.(value.trim())
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <label htmlFor="tekel-search" className="sr-only">
          Buscar contrato
        </label>
        <input
          id="tekel-search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Busca por ID SECOP (CO1.PCCNTR...), entidad o contratista"
          className="h-14 w-full rounded-2xl border border-hairline bg-surface pl-12 pr-32 text-[15px] shadow-[0_8px_24px_-14px_rgba(15,23,42,0.18)] outline-none transition-colors duration-150 placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/25"
        />
        <Button
          type="submit"
          size="lg"
          className="bg-brand-gradient absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-xl border-0 px-5 font-semibold text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.6)] hover:opacity-95"
        >
          Buscar
        </Button>
      </form>

      {notFoundSecopId && (
        <div className="card-soft flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FileSearch className="mt-0.5 size-5 text-warn" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Este contrato no está en nuestro corpus
              </p>
              <p className="num mt-0.5 text-xs text-muted-foreground">{notFoundSecopId}</p>
            </div>
          </div>
          <Button
            onClick={() => onAnalyzeLive?.(notFoundSecopId)}
            className="bg-brand-gradient shrink-0 rounded-xl border-0 font-semibold text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.6)] hover:opacity-95"
          >
            Analizarlo en vivo
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
