"use client";

import Link from "next/link";
import { COLOR_NIVEL, COLOR_PRIORIDAD, cop, fecha } from "@/lib/ui/formato";

export type ContratoLista = {
  id_contrato: string;
  nombre_entidad: string | null;
  proveedor: string | null;
  objeto: string | null;
  departamento: string | null;
  ciudad: string | null;
  modalidad: string | null;
  vigencia: string;
  valor_contrato: number | null;
  plata_en_riesgo: number | null;
  risk_score: number | null;
  risk_level: string | null;
  prioridad: string | null;
  porque_ahora: string[] | null;
  resumen_riesgo: string | null;
  valor_verificar: boolean;
  fecha_firma: string | null;
};

const chip = "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset";

export function TarjetaContrato({ c }: { c: ContratoLista }) {
  const razones = c.porque_ahora ?? [];

  return (
    <Link
      href={`/contrato/${encodeURIComponent(c.id_contrato)}`}
      className="block rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition
                 hover:border-slate-700 hover:bg-slate-900/70 focus:outline-none
                 focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {c.prioridad && (
          <span className={`${chip} ${COLOR_PRIORIDAD[c.prioridad] ?? ""}`}>{c.prioridad}</span>
        )}
        {c.risk_level && (
          <span className={`${chip} ${COLOR_NIVEL[c.risk_level] ?? ""}`}>
            {c.risk_level} · {c.risk_score ?? 0}
          </span>
        )}
        <span className={`${chip} bg-slate-500/10 text-slate-400 ring-slate-600/30`}>
          {c.vigencia === "vigente" ? "En ejecución" : c.vigencia === "historico" ? "Histórico" : "Otro"}
        </span>
        {c.valor_verificar && (
          <span className={`${chip} bg-orange-500/15 text-orange-300 ring-orange-500/30`}>
            valor a verificar
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-slate-500">{c.id_contrato}</span>
      </div>

      <h3 className="text-sm font-semibold leading-snug text-slate-100">
        {c.nombre_entidad ?? "Entidad no registrada"}
      </h3>
      <p className="mt-0.5 text-xs text-slate-400">
        {c.proveedor ?? "Contratista no registrado"}
        {c.ciudad ? ` · ${c.ciudad}` : ""}
        {c.fecha_firma ? ` · firmado ${fecha(c.fecha_firma)}` : ""}
      </p>

      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">
        {c.objeto ?? "Sin objeto registrado"}
      </p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <div>
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Valor</span>
          <p className="font-mono text-sm text-slate-200 tabular-nums">{cop(c.valor_contrato)}</p>
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wide text-slate-500">
            {c.vigencia === "vigente" ? "Sin desembolsar" : "Ya pagado"}
          </span>
          <p className="font-mono text-sm font-semibold text-sky-300 tabular-nums">
            {cop(c.plata_en_riesgo)}
          </p>
        </div>
      </div>

      {razones.length > 0 && (
        <p className="mt-3 border-l-2 border-slate-700 pl-3 text-xs leading-relaxed text-slate-400">
          {razones[0]}
        </p>
      )}
    </Link>
  );
}
