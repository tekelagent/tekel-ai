"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { COLOR_CONFIANZA, cop, fuenteDeHallazgo } from "@/lib/ui/formato";

export type HallazgoUI = {
  pattern_code: string;
  condicion: string;
  criterio: { norma: string; articulo: string | null; sintesis: string; cita: string };
  efecto_potencial: string;
  confianza: string;
  foco: string;
  aproximacion: boolean;
  evidence: Record<string, unknown>;
  source?: string;
};

const ES_DINERO = /valor|plata|multa|precio|monto|presupuesto|saldo/i;
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
  const fuente = fuenteDeHallazgo(h.source ?? "rules", h.pattern_code);

  const filas = Object.entries(h.evidence ?? {}).filter(
    ([k, v]) => !OCULTAR.test(k) && v !== null && v !== undefined && !Array.isArray(v),
  );
  const listas = Object.entries(h.evidence ?? {}).filter(([, v]) => Array.isArray(v) && v.length);

  return (
    <div className="card-soft overflow-hidden">
      <button
        onClick={() => setAbierto(!abierto)}
        className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-muted/50"
        aria-expanded={abierto}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="num font-mono text-xs font-bold text-foreground">
              {h.pattern_code}
            </span>
            {puntos !== undefined && (
              <span className="badge-pill bg-muted text-muted-foreground">{puntos} pts</span>
            )}
            {/* La procedencia del hallazgo importa: una regla es reproducible,
                un registro es verificable, una salida de IA merece escrutinio. */}
            <span className={`badge-pill ${fuente.clase}`}>{fuente.texto}</span>
            <span className={`badge-pill ${COLOR_CONFIANZA[h.confianza] ?? ""}`}>
              confianza {h.confianza}
            </span>
            <span className="badge-pill bg-muted text-muted-foreground">foco {h.foco}</span>
            {h.aproximacion && (
              <span className="badge-pill bg-warn-soft text-warn">medida aproximada</span>
            )}
          </div>
          <p
            className={`text-sm leading-relaxed text-foreground/85 ${abierto ? "" : "line-clamp-2"}`}
          >
            {h.condicion}
          </p>
        </div>
        <ChevronDown
          className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform ${
            abierto ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <div className="space-y-4 border-t border-hairline px-4 pb-4 pt-3">
          <Bloque titulo="Criterio">
            <p className="font-medium text-foreground">{h.criterio.cita}</p>
            <p className="mt-1 text-muted-foreground">{h.criterio.sintesis}</p>
          </Bloque>

          <Bloque titulo="Efecto potencial">
            <p className="text-foreground/85">{h.efecto_potencial}</p>
          </Bloque>

          {filas.length > 0 && (
            <Bloque titulo="Evidencia">
              <table className="w-full text-left">
                <tbody>
                  {filas.map(([k, v]) => (
                    <tr key={k} className="border-b border-hairline last:border-0">
                      <td className="py-1.5 pr-4 align-top font-mono text-[11px] text-muted-foreground">
                        {k}
                      </td>
                      <td className="num py-1.5 text-right font-mono text-[11px] tabular-nums text-foreground">
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
                  <li key={i} className="font-mono text-[11px] text-muted-foreground">
                    {typeof item === "object"
                      ? Object.entries(item as Record<string, unknown>)
                          .map(([kk, vv]) => `${kk}: ${valorLegible(kk, vv)}`)
                          .join(" · ")
                      : String(item)}
                  </li>
                ))}
                {(v as unknown[]).length > 6 && (
                  <li className="text-[11px] text-muted-foreground/70">
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
      <h4 className="label-eyebrow mb-1.5">{titulo}</h4>
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  );
}
