import { ClipboardList, ArrowRight } from "lucide-react"

/** Líneas de verificación sugeridas: qué haría a continuación un investigador. */
export function NextSteps({ lineas }: { lineas: string[] }) {
  return (
    <section
      aria-labelledby="verif-h"
      className="card-soft overflow-hidden"
    >
      <header className="flex items-center gap-2 border-b border-hairline px-5 py-4">
        <ClipboardList className="size-4 text-foreground" aria-hidden />
        <h2 id="verif-h" className="text-sm font-semibold">
          Líneas de verificación sugeridas
        </h2>
      </header>
      <ol className="flex flex-col divide-y divide-hairline">
        {lineas.map((l, i) => (
          <li key={i} className="flex items-start gap-3 px-5 py-3">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold num text-[var(--brand-via)]">
              {i + 1}
            </span>
            <p className="text-[13px] leading-relaxed text-foreground/90">{l}</p>
            <ArrowRight className="ml-auto mt-0.5 size-3.5 shrink-0 text-p3" aria-hidden />
          </li>
        ))}
      </ol>
      <p className="border-t border-hairline px-5 py-3 text-[12px] leading-relaxed text-muted-foreground">
        Estas líneas son sugerencias de investigación generadas a partir de los hallazgos. No
        constituyen una imputación ni una conclusión de responsabilidad.
      </p>
    </section>
  )
}
