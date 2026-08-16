import Link from "next/link"
import { Scale } from "lucide-react"

const FUENTES = [
  "SECOP II",
  "RUES",
  "Contraloría (SIBOR)",
  "Procuraduría (SIRI)",
  "SIC",
  "Obras Inconclusas",
]

export function SiteFooter({ catalogo }: { catalogo?: string }) {
  return (
    <footer className="mt-20 border-t border-hairline bg-surface/70">
      <div className="mx-auto flex max-w-[1360px] flex-col gap-8 px-4 py-10 md:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <span className="inline-flex items-center gap-2">
              <span className="icon-tile bg-brand-gradient size-7">
                <Scale className="size-4" strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="text-sm font-bold text-foreground">Tekel</span>
            </span>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground text-pretty">
              Tekel audita cada contrato del Estado colombiano y señala cuáles merecen
              revisión humana, con indicadores verificables en fuentes oficiales.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="label-eyebrow">Fuentes oficiales</span>
            <ul className="flex max-w-xs flex-wrap gap-1.5">
              {FUENTES.map((f) => (
                <li
                  key={f}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <nav className="flex flex-col gap-2" aria-label="Pie de página">
            <span className="label-eyebrow">Plataforma</span>
            <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Panel de vigilancia
            </Link>
            <Link
              href="/metodologia"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Metodología
            </Link>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-hairline pt-5 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground text-pretty">
            Tekel señala indicadores de riesgo verificables en fuentes oficiales. No
            constituye imputación ni acusación.
          </p>
          {catalogo && <p className="num text-xs text-muted-foreground">{catalogo}</p>}
        </div>
      </div>
    </footer>
  )
}
