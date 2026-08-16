import { patternLabel } from "@/lib/patterns"

/** Muestra hasta `max` patrones como chips sobrios + "+n". Nunca códigos crudos. */
export function PatternChips({ codes, max = 3 }: { codes: string[]; max?: number }) {
  const shown = codes.slice(0, max)
  const rest = codes.length - shown.length

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((code) => (
        <span
          key={code}
          className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-medium text-[var(--brand-via)]"
        >
          {patternLabel(code)}
        </span>
      ))}
      {rest > 0 && (
        <span className="num inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          +{rest}
        </span>
      )}
    </div>
  )
}
