import Link from "next/link"
import { ArrowLeft, ListChecks, AlertCircle } from "lucide-react"
import type {
  AnalysisState,
  Contract,
  Finding,
  ForensicProfile,
  OtrosiExtract,
  PliegoCita,
} from "@/lib/types"
import { ContractHeader } from "./contract-header"
import { ScorePanel, PorQueAhora } from "./score-panel"
import { FactsPanel } from "./facts-panel"
import { FindingCard } from "./finding-card"
import { ForensicPanel } from "./forensic-panel"
import { DocumentsPanel } from "./documents-panel"
import { NextSteps } from "./next-steps"

type DetailViewProps = {
  contract: Contract
  findings: Finding[]
  /** Perfil de Croma ya ejecutado, o null si la Capa C no ha corrido. */
  forensic: ForensicProfile | null
  analysis: AnalysisState | null
  citas: PliegoCita[]
  otrosi: OtrosiExtract | null
  lineas: string[]
  /** Se pinta cuando aún no hay perfil forense: dispara la Capa C. */
  slotAnalisis?: React.ReactNode
}

export function DetailView({
  contract: c,
  findings,
  forensic,
  analysis,
  citas,
  otrosi,
  lineas,
  slotAnalisis,
}: DetailViewProps) {
  const totalPoints = findings.reduce((s, f) => s + f.points, 0)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver al tablero
      </Link>

      <ContractHeader contract={c} />

      {c.valor_verificar && (
        <div
          role="note"
          className="mt-5 flex items-start gap-2.5 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-[13px] leading-relaxed text-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <p>
            El valor reportado para este contrato parece inverosímil frente al alcance descrito.
            Antes de priorizarlo, verifique la cifra directamente en la fuente oficial (SECOP).
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Columna principal */}
        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <ScorePanel contract={c} />
            <PorQueAhora contract={c} />
          </div>

          {/* Hallazgos */}
          <section aria-labelledby="hallazgos-h">
            <div className="mb-3 flex items-center gap-2">
              <ListChecks className="size-4 text-foreground" aria-hidden />
              <h2 id="hallazgos-h" className="text-sm font-semibold">
                Hallazgos que sostienen el score
              </h2>
              {findings.length > 0 && (
                <span className="ml-auto text-[12px] text-muted-foreground">
                  {findings.length} {findings.length === 1 ? "hallazgo" : "hallazgos"} ·{" "}
                  <span className="num font-semibold text-foreground">+{totalPoints} pts</span>
                </span>
              )}
            </div>
            {findings.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {findings.map((f) => (
                  <FindingCard key={f.pattern_code} finding={f} />
                ))}
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  Cada hallazgo suma puntos al score según su severidad y confianza. El score es una
                  señal de priorización, no un juicio de responsabilidad.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-input bg-surface/70 px-5 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Este contrato no registra hallazgos automáticos por encima del umbral. Su
                  clasificación proviene de señales de contexto.
                </p>
              </div>
            )}
          </section>

          {/* Con perfil, se muestra. Sin él, el slot trae el botón que
              dispara la Capa C y pinta el log en vivo. */}
          {forensic ? (
            <ForensicPanel profile={forensic} analysis={analysis ?? undefined} />
          ) : (
            slotAnalisis
          )}

          {(citas.length > 0 || otrosi) && (
            <DocumentsPanel citas={citas} otrosi={otrosi ?? undefined} />
          )}
        </div>

        {/* Columna lateral */}
        <aside className="flex flex-col gap-6">
          <FactsPanel c={c} />
          <NextSteps lineas={lineas} />
        </aside>
      </div>
    </div>
  )
}
