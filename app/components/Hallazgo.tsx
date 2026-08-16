"use client";

import { useState } from "react";
import { cop } from "@/lib/ui/formato";

export type HallazgoUI = {
  pattern_code: string;
  condicion: string;
  criterio: { norma: string; articulo: string | null; sintesis: string; cita: string };
  efecto_potencial: string;
  confianza: string;
  foco: string;
  aproximacion: boolean;
  evidence: Record<string, unknown>;
};

const COLOR_CONFIANZA: Record<string, string> = {
  alta: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  media: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  baja: "bg-slate-500/15 text-slate-400 ring-slate-500/30",
};

/** Claves de evidence que se muestran como dinero. */
const ES_DINERO = /valor|plata|multa|precio|monto|presupuesto|saldo/i;
/** Ruido interno que no aporta al auditor. */
const OCULTAR = /^(modelo|via_vision|solo_agravante|corpus_parcial|es_snapshot)$/;

function valorLegible(k: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return ES_DINERO.test(k) ? cop(v, false) : v.toLocaleString("es-CO");
  if (Array.isArray(v)) return `${v.length} elemento(s)`;
  if (typeof v === "object") return JSON.stringify(v).slice(0, 120);
  return String(v);
}

export function Hallazgo({ h, puntos }: { h: HallazgoUI; puntos?: number }) {
  const [abierto, setAbierto] = useState(false);

  const filas = Object.entries(h.evidence ?? {}).filter(
    ([k, v]) => !OCULTAR.test(k) && v !== null && v !== undefined && !Array.isArray(v),
  );
  const listas = Object.entries(h.evidence ?? {}).filter(([, v]) => Array.isArray(v) && v.length);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <button
        onClick={() => setAbierto(!abierto)}
        className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-slate-900/70"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-slate-100">
              {h.pattern_code}
            </span>
            {puntos !== undefined && (
              <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-[11px] text-slate-300">
                {puntos} pts
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${
                COLOR_CONFIANZA[h.confianza] ?? ""
              }`}
            >
              confianza {h.confianza}
            </span>
            <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] text-slate-400 ring-1 ring-inset ring-slate-600/30">
              foco {h.foco}
            </span>
            {h.aproximacion && (
              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] text-orange-300 ring-1 ring-inset ring-orange-500/30">
                medida aproximada
              </span>
            )}
          </div>
          <p className={`text-xs leading-relaxed text-slate-300 ${abierto ? "" : "line-clamp-2"}`}>
            {h.condicion}
          </p>
        </div>
        <span className="mt-1 shrink-0 text-slate-500">{abierto ? "−" : "+"}</span>
      </button>

      {abierto && (
        <div className="space-y-4 border-t border-slate-800 px-4 pb-4 pt-3">
          <Bloque titulo="Criterio">
            <p className="font-medium text-slate-200">{h.criterio.cita}</p>
            <p className="mt-1 text-slate-400">{h.criterio.sintesis}</p>
          </Bloque>

          <Bloque titulo="Efecto potencial">
            <p className="text-slate-300">{h.efecto_potencial}</p>
          </Bloque>

          {filas.length > 0 && (
            <Bloque titulo="Evidencia">
              <table className="w-full text-left">
                <tbody>
                  {filas.map(([k, v]) => (
                    <tr key={k} className="border-b border-slate-800/60 last:border-0">
                      <td className="py-1.5 pr-4 align-top font-mono text-[11px] text-slate-500">
                        {k}
                      </td>
                      <td className="py-1.5 text-right font-mono text-[11px] tabular-nums text-slate-300">
                        {valorLegible(k, v)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Bloque>
          )}

          {listas.map(([k, v]) => (
            <Bloque key={k} titulo={k.replace(/_/g, " ")}>
              <ul className="space-y-1">
                {(v as unknown[]).slice(0, 6).map((item, i) => (
                  <li key={i} className="font-mono text-[11px] text-slate-400">
                    {typeof item === "object"
                      ? Object.entries(item as Record<string, unknown>)
                          .map(([kk, vv]) => `${kk}: ${valorLegible(kk, vv)}`)
                          .join(" · ")
                      : String(item)}
                  </li>
                ))}
                {(v as unknown[]).length > 6 && (
                  <li className="text-[11px] text-slate-600">
                    …y {(v as unknown[]).length - 6} más
                  </li>
                )}
              </ul>
            </Bloque>
          ))}
        </div>
      )}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {titulo}
      </h4>
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  );
}
