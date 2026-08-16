import Link from "next/link"
import { ArrowLeft, Database, FileText, Landmark, ShieldAlert } from "lucide-react"
import { PATTERNS, type PatternInfo } from "@/lib/patterns"

const RISK_BANDS = [
  {
    label: "Crítico",
    min: 70,
    max: 100,
    color: "var(--crit)",
    soft: "var(--crit-soft)",
    nota: "Prioridad de revisión inmediata. Concentra las señales de mayor severidad.",
  },
  {
    label: "Medio",
    min: 40,
    max: 69,
    color: "var(--warn)",
    soft: "var(--warn-soft)",
    nota: "Requiere revisión ordenada. Señales relevantes que conviene contrastar.",
  },
  {
    label: "Bajo",
    min: 0,
    max: 39,
    color: "var(--ok)",
    soft: "var(--ok-soft)",
    nota: "Sin señales destacadas. Revisión de rutina o muestreo aleatorio.",
  },
] as const

const SOURCE_META: Record<
  PatternInfo["fuente"],
  { icon: typeof Database; nota: string }
> = {
  "Datos SECOP": {
    icon: Database,
    nota: "Señales calculadas sobre los datos abiertos de contratación pública (SECOP I/II).",
  },
  "Registros oficiales": {
    icon: Landmark,
    nota: "Cruces con registros públicos: Cámara de Comercio, SIC, BDME y boletines oficiales.",
  },
  Documentos: {
    icon: FileText,
    nota: "Extracción de texto sobre pliegos, contratos y otrosíes publicados en el expediente.",
  },
}

const SCORE_STEPS = [
  {
    n: "01",
    titulo: "Recolección",
    texto:
      "Se consolidan los datos estructurados del contrato, los registros oficiales del contratista y los documentos del expediente.",
  },
  {
    n: "02",
    titulo: "Detección de patrones",
    texto:
      "Cada regla evalúa el contrato de forma independiente y devuelve una señal cuando se cumplen sus condiciones.",
  },
  {
    n: "03",
    titulo: "Ponderación",
    texto:
      "Las señales se ponderan según severidad, calidad de la evidencia y la fuente que las respalda.",
  },
  {
    n: "04",
    titulo: "Puntaje agregado",
    texto:
      "El resultado es un puntaje de 0 a 100 que ordena los contratos por prioridad de revisión, nunca por culpabilidad.",
  },
]

export function MethodologyView() {
  const grouped = Object.entries(PATTERNS).reduce<
    Record<PatternInfo["fuente"], Array<{ code: string } & PatternInfo>>
  >(
    (acc, [code, info]) => {
      ;(acc[info.fuente] ??= []).push({ code, ...info })
      return acc
    },
    {} as Record<PatternInfo["fuente"], Array<{ code: string } & PatternInfo>>,
  )

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver al panel
      </Link>

      {/* Encabezado */}
      <header className="mt-6 border-b border-hairline pb-8">
        <span className="badge-pill border border-hairline bg-surface text-muted-foreground">
          Documento técnico
        </span>
        <h1 className="mt-4 text-pretty text-3xl font-bold tracking-tight lg:text-4xl">
          Cómo Tekel <span className="text-gradient">calcula el riesgo</span>
        </h1>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          Tekel es una herramienta de priorización para el control fiscal. Ordena los contratos
          según señales verificables y explica cada una de ellas. No emite juicios ni sustituye la
          investigación de los organismos competentes.
        </p>
      </header>

      {/* Cómo se construye el puntaje */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">El puntaje, paso a paso</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2">
          {SCORE_STEPS.map((s) => (
            <li key={s.n} className="card-soft p-5">
              <span className="text-gradient font-mono text-sm font-bold">{s.n}</span>
              <h3 className="mt-1 font-semibold">{s.titulo}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Bandas de riesgo */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Bandas de riesgo</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          El puntaje se agrupa en tres bandas que orientan la carga de revisión.
        </p>
        <div className="mt-6 space-y-2">
          {RISK_BANDS.map((band) => (
            <div
              key={band.label}
              className="card-soft flex items-center gap-4 p-4"
            >
              <span
                className="num inline-flex h-10 w-16 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-semibold"
                style={{ backgroundColor: band.soft, color: band.color }}
              >
                {band.min}–{band.max}
              </span>
              <div>
                <p className="font-medium" style={{ color: band.color }}>
                  {band.label}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">{band.nota}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Catálogo de patrones por fuente */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Catálogo de patrones</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Cada señal indica su fuente y la norma de referencia asociada.
        </p>

        <div className="mt-6 space-y-8">
          {(Object.keys(grouped) as PatternInfo["fuente"][]).map((fuente) => {
            const meta = SOURCE_META[fuente]
            const Icon = meta.icon
            return (
              <div key={fuente}>
                <div className="flex items-start gap-3">
                  <span className="icon-tile bg-brand-gradient size-9 shrink-0">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{fuente}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{meta.nota}</p>
                  </div>
                </div>
                <ul className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline shadow-[0_8px_24px_-12px_rgba(15,23,42,0.12)]">
                  {grouped[fuente].map((p) => (
                    <li key={p.code} className="bg-surface px-4 py-3.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="font-medium">{p.label}</span>
                        <span className="num font-mono text-[11px] text-muted-foreground">
                          {p.norma}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {p.descripcion}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {/* Advertencia */}
      <aside className="mt-12 flex gap-3 rounded-2xl border border-warn/30 bg-warn-soft p-5">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" />
        <div>
          <h2 className="font-semibold">Alcance y limitaciones</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
            Una señal de Tékel no constituye prueba de irregularidad ni imputación de
            responsabilidad. Es un indicio que debe ser verificado con el expediente completo y las
            garantías del debido proceso. Los datos provienen de fuentes públicas y pueden contener
            errores de origen o estar desactualizados.
          </p>
        </div>
      </aside>
    </div>
  )
}
