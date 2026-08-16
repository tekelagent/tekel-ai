import type { Contract } from "@/lib/types"
import { priorityTone, riskColor, riskLabel } from "./meta"
import { ScoreRing } from "./score-ring"

export function ScorePanel({ contract: c }: { contract: Contract }) {
  const tone = priorityTone(c.prioridad)
  return (
    <div className="card-soft flex items-center gap-5 p-6">
      <ScoreRing
        score={c.risk_score}
        color={riskColor(c.risk_level)}
        size={104}
        stroke={7}
        fontSize={40}
      />
      <div className="flex flex-col gap-2">
        <span className="label-eyebrow">Score de riesgo</span>
        <span className="text-lg font-semibold tracking-wide" style={{ color: riskColor(c.risk_level) }}>
          {riskLabel(c.risk_level)}
        </span>
        {c.prioridad && (
          <span
            className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone.text} ${tone.bg} ${tone.border}`}
          >
            Prioridad {c.prioridad}
          </span>
        )}
      </div>
    </div>
  )
}

export function PorQueAhora({ contract: c }: { contract: Contract }) {
  const tone = priorityTone(c.prioridad)
  if (!c.porque_ahora.length) return null
  return (
    <div
      className="card-soft border-l-4 p-6"
      style={{ borderLeftColor: tone.ring }}
    >
      <h2 className="text-sm font-semibold text-foreground">Por qué revisar ahora</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {c.porque_ahora.map((reason, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/90">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tone.ring }} />
            <span className="text-pretty">{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
