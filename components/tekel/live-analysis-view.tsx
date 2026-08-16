"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  FileSearch,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

type LogLine = { t: number; msg: string; phase: 0 | 1 | 2 }

/** Guion del análisis en vivo: cada línea aparece en su momento (ms desde el inicio). */
function buildScript(id: string): LogLine[] {
  return [
    { t: 0, msg: `Iniciando análisis en vivo de ${id}`, phase: 0 },
    { t: 900, msg: "Conectando con datos abiertos de SECOP II (Socrata)...", phase: 0 },
    { t: 2200, msg: "[OK] Contrato encontrado: registro recuperado en 1,3 s", phase: 0 },
    { t: 3000, msg: "Normalizando entidad, contratista, valores y fechas", phase: 0 },
    { t: 3900, msg: "[OK] Ingesta completa - pasando a reglas deterministas", phase: 0 },
    { t: 4700, msg: "Ejecutando 20+ reglas de aritmetica y estadistica...", phase: 0 },
    { t: 5600, msg: "[OK] Regla ADICIONES_50: sin adiciones registradas", phase: 0 },
    { t: 6400, msg: "[!] Regla VALOR_ATIPICO: 2,8 desviaciones sobre contratos comparables", phase: 0 },
    { t: 7300, msg: "[!] Regla PLAZO_RELAMPAGO: adjudicado en 4 dias habiles", phase: 0 },
    { t: 8100, msg: "[OK] Regla FRACCIONAMIENTO: sin indicios en la muestra", phase: 0 },
    { t: 9000, msg: "Consultando RUES...", phase: 1 },
    { t: 10400, msg: "[OK] RUES: empresa constituida en 1994, capital verificado", phase: 1 },
    { t: 11200, msg: "Consultando Contraloria (boletin de responsables fiscales)...", phase: 1 },
    { t: 12600, msg: "[OK] Contraloria: sin responsabilidad fiscal vigente", phase: 1 },
    { t: 13400, msg: "Consultando Procuraduria (SIRI)...", phase: 1 },
    { t: 14800, msg: "[OK] SIRI: sin antecedentes disciplinarios", phase: 1 },
    { t: 15600, msg: "Consultando SIC (colusiones sancionadas)...", phase: 1 },
    { t: 16800, msg: "[OK] SIC: sin sanciones por colusion", phase: 1 },
    { t: 17500, msg: "Consultando Registro Nacional de Obras Inconclusas...", phase: 1 },
    { t: 18700, msg: "[OK] Obras Inconclusas: sin coincidencias", phase: 1 },
    { t: 19500, msg: "Contrato priorizado: activando capa de IA documental", phase: 2 },
    { t: 20400, msg: "Descargando pliego de condiciones (PDF, 84 pags.)...", phase: 2 },
    { t: 22000, msg: "Leyendo requisitos habilitantes...", phase: 2 },
    { t: 23600, msg: "[!] Requisito dirigido detectado: experiencia especifica citada en pag. 27", phase: 2 },
    { t: 24800, msg: "Buscando otrosies y modificaciones...", phase: 2 },
    { t: 26000, msg: "[OK] Sin otrosies registrados a la fecha", phase: 2 },
    { t: 27000, msg: "Armando expediente y calculando score de riesgo...", phase: 2 },
    { t: 28200, msg: "[OK] Expediente listo: score 61/100 - prioridad P2", phase: 2 },
  ]
}

const PHASES = [
  {
    icon: Database,
    gradient: "linear-gradient(120deg, #2563eb, #38bdf8)",
    title: "Ingesta + reglas deterministas",
    desc: "Trae el contrato de SECOP II y corre 20+ reglas de datos oficiales.",
  },
  {
    icon: ShieldCheck,
    gradient: "linear-gradient(120deg, #4f46e5, #7c3aed)",
    title: "Registros oficiales",
    desc: "RUES, Contraloría, Procuraduría, SIC y obras inconclusas en tiempo real.",
  },
  {
    icon: Sparkles,
    gradient: "linear-gradient(120deg, #7c3aed, #d946ef)",
    title: "IA sobre el pliego",
    desc: "Lee el PDF, cita texto y página, y extrae montos de los otrosíes.",
  },
]

function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000)
  return `00:${String(s).padStart(2, "0")}`
}

export function LiveAnalysisView({ secopId }: { secopId: string }) {
  const script = useMemo(() => buildScript(secopId), [secopId])
  const total = script[script.length - 1].t + 800
  const [elapsed, setElapsed] = useState(0)
  const consoleRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const started = Date.now()
    const int = setInterval(() => {
      const e = Date.now() - started
      setElapsed(e)
      if (e >= total) clearInterval(int)
    }, 120)
    return () => clearInterval(int)
  }, [total])

  const lines = script.filter((l) => l.t <= elapsed)
  const done = elapsed >= total
  const currentPhase = done ? 3 : (lines[lines.length - 1]?.phase ?? 0)
  const progress = Math.min(100, Math.round((elapsed / total) * 100))

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight, behavior: "smooth" })
  }, [lines.length])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver al tablero
      </Link>

      <div className="flex flex-col items-center gap-3 text-center">
        <span className="badge-pill border border-hairline bg-surface text-muted-foreground">
          {done ? (
            <Check className="size-3.5 text-ok" aria-hidden />
          ) : (
            <Loader2 className="size-3.5 animate-spin text-[var(--brand-via)]" aria-hidden />
          )}
          {done ? "Expediente armado" : "Análisis en vivo — este contrato no estaba en el corpus"}
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">
          {done ? (
            <>
              Expediente listo en <span className="text-gradient">{fmtClock(total)}</span>
            </>
          ) : (
            <>
              Armando el expediente <span className="text-gradient">en tiempo real</span>
            </>
          )}
        </h1>
        <p className="num font-mono text-sm text-muted-foreground">{secopId}</p>
      </div>

      {/* Fases del embudo */}
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {PHASES.map((p, i) => {
          const state = currentPhase > i ? "done" : currentPhase === i ? "running" : "pending"
          return (
            <div
              key={p.title}
              className={cn(
                "card-soft flex items-start gap-3 p-4 transition-opacity duration-300",
                state === "pending" && "opacity-50",
              )}
            >
              <span className="icon-tile size-9 shrink-0" style={{ backgroundImage: p.gradient }}>
                {state === "done" ? (
                  <Check className="size-4" strokeWidth={2.5} aria-hidden />
                ) : state === "running" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <p.icon className="size-4" aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-snug">{p.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{p.desc}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* La consola: la pieza central */}
      <div
        className="mt-6 overflow-hidden rounded-2xl shadow-[0_24px_60px_-24px_rgba(15,23,42,0.5)]"
        style={{ backgroundColor: "#0b1120" }}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-rose-500/80" />
            <span className="size-2.5 rounded-full bg-amber-400/80" />
            <span className="size-2.5 rounded-full bg-emerald-500/80" />
          </span>
          <span className="ml-2 font-mono text-xs text-slate-400">
            tekel — análisis en vivo
          </span>
          <span className="num ml-auto font-mono text-xs text-slate-500">
            {fmtClock(Math.min(elapsed, total))} / {fmtClock(total)}
          </span>
        </div>

        {/* Barra de progreso con degradado */}
        <div className="h-1 w-full bg-white/5">
          <div
            className="bg-brand-gradient h-full transition-[width] duration-300 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ol
          ref={consoleRef}
          aria-live="polite"
          className="h-80 overflow-y-auto p-4 font-mono text-[12.5px] leading-relaxed md:h-96"
        >
          {lines.map((l, i) => {
            const m = l.msg.match(/^\[(OK|!|ERR)\]\s(.*)$/)
            const markerCls =
              m?.[1] === "OK"
                ? "text-emerald-400"
                : m?.[1] === "ERR"
                  ? "text-rose-400"
                  : "text-amber-400"
            return (
              <li key={i} className="log-line-in flex gap-3">
                <span className="num shrink-0 text-slate-600">{fmtClock(l.t)}</span>
                {m ? (
                  <span className="text-slate-200">
                    <span className={markerCls}>[{m[1]}]</span> {m[2]}
                  </span>
                ) : (
                  <span className="text-slate-400">{l.msg}</span>
                )}
              </li>
            )
          })}
          {!done && (
            <li className="flex gap-3" aria-hidden="true">
              <span className="num shrink-0 text-slate-600">{fmtClock(elapsed)}</span>
              <span className="animate-pulse text-slate-500">▍</span>
            </li>
          )}
        </ol>
      </div>

      {/* Resultado al terminar */}
      {done && (
        <div className="card-soft log-line-in mt-6 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="icon-tile bg-brand-gradient size-12 shrink-0">
              <FileSearch className="size-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">
                Score 61/100 — prioridad P2 · 3 hallazgos con evidencia citada
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground text-pretty">
                Valor atípico frente a comparables, plazo exprés de adjudicación y un requisito
                dirigido citado en la página 27 del pliego. Verificable en SECOP.
              </p>
            </div>
          </div>
          <Link
            href="/contrato/CO1.PCCNTR.9012455"
            className={`${buttonVariants({ size: "lg" })} bg-brand-gradient shrink-0 rounded-xl border-0 font-semibold text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.6)] hover:opacity-95`}
          >
            Ver expediente de ejemplo
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
        Demostración con datos simulados. En producción, Tekel consulta SECOP II y los registros
        oficiales en tiempo real (~90 segundos por contrato).
      </p>
    </div>
  )
}
