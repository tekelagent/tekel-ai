import { FileText, Quote } from "lucide-react"
import type { OtrosiExtract, PliegoCita } from "@/lib/types"
import { formatCOP } from "@/lib/format"
import { PATTERNS } from "@/lib/patterns"

export function DocumentsPanel({
  citas,
  otrosi,
}: {
  citas: PliegoCita[]
  otrosi?: OtrosiExtract
}) {
  return (
    <section aria-labelledby="docs-h" className="card-soft overflow-hidden">
      <header className="flex items-center gap-2 border-b border-hairline px-5 py-4">
        <FileText className="size-4 text-foreground" aria-hidden />
        <h2 id="docs-h" className="text-sm font-semibold">
          Evidencia documental
        </h2>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Extraída de anexos del proceso
        </span>
      </header>

      <div className="p-5">
        {/* Extracto del otrosí: la cifra que sostiene el hallazgo principal.
            Solo aparece si el usuario aportó ese documento — SECOP no publica
            el valor adicionado. */}
        {otrosi && (
        <div className="rounded-xl border border-crit/25 bg-crit-soft/60 p-4">
          <p className="label-eyebrow text-crit">Otrosí modificatorio · pág. {otrosi.pagina}</p>
          <blockquote className="mt-2 border-l-2 border-crit/40 pl-3 text-[13px] italic leading-relaxed text-foreground/85">
            {"\u201C"}
            {otrosi.cita}
            {"\u201D"}
          </blockquote>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="label-eyebrow">Valor inicial</dt>
              <dd className="num">{formatCOP(otrosi.valor_inicial)}</dd>
            </div>
            <div>
              <dt className="label-eyebrow">Adicionado</dt>
              <dd className="num">{formatCOP(otrosi.valor_adicionado)}</dd>
            </div>
            <div>
              <dt className="label-eyebrow">Sobre el inicial</dt>
              <dd className="num font-semibold text-crit">+{otrosi.porcentaje}%</dd>
            </div>
          </dl>
        </div>
        )}

        {/* Citas del pliego */}
        <ul className="mt-4 flex flex-col gap-3">
          {citas.map((cita, i) => {
            const p = PATTERNS[cita.pattern_code]
            return (
              <li key={i} className="rounded-xl border border-hairline bg-canvas p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground">
                    <FileText className="size-3.5" aria-hidden />
                    {cita.archivo} · pág. {cita.pagina}
                  </span>
                  {p && (
                    <span className="rounded border border-hairline bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {p.label}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Quote className="mt-0.5 size-3.5 shrink-0 text-p3" aria-hidden />
                  <p className="text-[13px] italic leading-relaxed text-foreground/80">{cita.cita}</p>
                </div>
                <p className="mt-2 border-t border-hairline pt-2 text-[13px] leading-snug text-foreground">
                  <span className="font-medium">Lectura del analista: </span>
                  {cita.hallazgo}
                </p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
