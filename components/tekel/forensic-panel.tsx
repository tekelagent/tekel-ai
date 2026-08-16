"use client"

import { useEffect, useRef, useState } from "react"
import { Check, AlertTriangle, MinusCircle, Loader2, ShieldCheck } from "lucide-react"
import type { AnalysisState, ForensicProfile } from "@/lib/types"
import { formatCOP, formatDateShort } from "@/lib/format"

const CHECK_ICON = {
  ok: { Icon: Check, cls: "text-ok" },
  alerta: { Icon: AlertTriangle, cls: "text-warn" },
  omitido: { Icon: MinusCircle, cls: "text-muted-foreground" },
} as const

export function ForensicPanel({
  profile,
  analysis,
}: {
  profile: ForensicProfile
  analysis?: AnalysisState
}) {
  // Reproduce el log línea por línea para simular el análisis en vivo.
  const [visible, setVisible] = useState(1)
  const logRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    if (visible >= (analysis?.log.length ?? 0)) return
    const t = setTimeout(() => setVisible((v) => v + 1), 700)
    return () => clearTimeout(t)
  }, [visible, (analysis?.log.length ?? 0)])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" })
  }, [visible])

  const running = visible < (analysis?.log.length ?? 0)
  const emp = profile.empresa

  return (
    <section aria-labelledby="forense-h" className="card-soft overflow-hidden">
      <header className="flex items-center gap-2 border-b border-hairline px-5 py-4">
        <ShieldCheck className="size-4 text-foreground" aria-hidden />
        <h2 id="forense-h" className="text-sm font-semibold">
          Verificación forense del contratista
        </h2>
        <span className="ml-auto text-[11px] text-muted-foreground num">
          Consultado {formatDateShort(profile.consultado_en.slice(0, 10))}
        </span>
      </header>

      <div className="grid gap-0 md:grid-cols-2">
        {/* Identidad + registros oficiales */}
        <div className="border-b border-hairline p-5 md:border-b-0 md:border-r">
          {emp && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="col-span-2">
                <dt className="label-eyebrow">Razón social</dt>
                <dd className="font-medium">{emp.razon_social}</dd>
              </div>
              <div>
                <dt className="label-eyebrow">NIT</dt>
                <dd className="num">{emp.nit}</dd>
              </div>
              <div>
                <dt className="label-eyebrow">Antigüedad</dt>
                <dd>{emp.antiguedad_texto}</dd>
              </div>
              <div className="col-span-2">
                <dt className="label-eyebrow">Representante legal</dt>
                <dd>{emp.representante}</dd>
              </div>
            </dl>
          )}

          <ul className="mt-5 flex flex-col gap-2">
            {profile.checks.map((c) => {
              const { Icon, cls } = CHECK_ICON[c.resultado]
              return (
                <li key={c.nombre} className="flex items-start gap-2.5 text-sm">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${cls}`} aria-hidden />
                  <div>
                    <p className="font-medium leading-snug">{c.nombre}</p>
                    <p className="text-[13px] leading-snug text-muted-foreground">{c.detalle}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Log en vivo + contratos previos */}
        <div className="flex flex-col p-5">
          <div className="mb-2 flex items-center gap-2">
            {running ? (
              <Loader2 className="size-3.5 animate-spin text-warn" aria-hidden />
            ) : (
              <Check className="size-3.5 text-ok" aria-hidden />
            )}
            <span className="label-eyebrow">
              {running ? "Cruzando fuentes en tiempo real" : "Consulta finalizada"}
            </span>
          </div>

          <ol
            ref={logRef}
            className="mb-4 max-h-44 overflow-y-auto rounded-xl bg-[#0f172a] p-3.5 font-mono text-[12px] leading-relaxed text-slate-300 shadow-inner"
            aria-live="polite"
          >
            {(analysis?.log ?? []).slice(0, visible).map((l, i) => {
              const m = l.msg.match(/^\[(OK|!|ERR)\]\s(.*)$/)
              const markerCls =
                m?.[1] === "OK"
                  ? "text-emerald-400"
                  : m?.[1] === "ERR"
                    ? "text-rose-400"
                    : "text-amber-400"
              return (
                <li key={i} className="log-line-in flex gap-2">
                  <span className="shrink-0 text-slate-500 num">{l.ts}</span>
                  {m ? (
                    <span className="text-slate-200">
                      <span className={markerCls}>[{m[1]}]</span> {m[2]}
                    </span>
                  ) : (
                    <span className="text-slate-200">{l.msg}</span>
                  )}
                </li>
              )
            })}
          </ol>

          {profile.contratos_previos && (
            <div>
              <p className="label-eyebrow mb-2">
                Contratos previos del contratista ({profile.contratos_previos.count})
              </p>
              <ul className="flex flex-col divide-y divide-hairline text-sm">
                {profile.contratos_previos.muestra.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="truncate text-[13px]">{c.entidad}</span>
                    <span className="shrink-0 text-[13px] num text-muted-foreground">
                      {formatCOP(c.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
