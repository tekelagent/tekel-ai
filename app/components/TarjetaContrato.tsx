"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Building2, Landmark, Wallet } from "lucide-react";
import { ScoreRing } from "./ScoreRing";
import { colorRiesgo, cop, fecha, tonoPrioridad } from "@/lib/ui/formato";

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

export function TarjetaContrato({ c }: { c: ContratoLista }) {
  const tono = tonoPrioridad(c.prioridad);
  const color = colorRiesgo(c.risk_level);
  const razon = c.porque_ahora?.[0];
  const etiquetaRiesgo = c.vigencia === "historico" ? "Pagado bajo revisión" : "Plata en riesgo";

  return (
    <Link
      href={`/contrato/${encodeURIComponent(c.id_contrato)}`}
      className="card-soft group relative flex flex-col overflow-hidden p-5 transition-all duration-200
                 hover:-translate-y-1 hover:shadow-[0_20px_48px_-18px_rgba(15,23,42,0.24)]
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Resplandor superior según el nivel de riesgo */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-24 opacity-[0.07]"
        style={{ background: `radial-gradient(60% 100% at 15% 0%, ${color}, transparent 70%)` }}
      />

      <div className="relative flex items-start gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="rounded-full p-1.5"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}
          >
            <ScoreRing score={c.risk_score} color={color} size={48} stroke={4.5} />
          </div>
          {c.prioridad && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${tono.text} ${tono.bg}`}
            >
              {c.prioridad}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
                <Landmark className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{c.nombre_entidad ?? "Entidad no registrada"}</span>
              </h3>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{c.proveedor ?? "Contratista no registrado"}</span>
              </p>
            </div>
            <ArrowUpRight
              className="size-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-200
                         group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
              aria-hidden="true"
            />
          </div>

          <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-foreground/85">
            {c.objeto ?? "Sin objeto registrado"}
          </p>
        </div>
      </div>

      {/* Franja de cifras */}
      <div className="relative mt-4 grid grid-cols-2 gap-2.5 rounded-xl bg-muted/60 p-3">
        <div className="flex items-center gap-2">
          <span className="bg-brand-gradient flex size-8 shrink-0 items-center justify-center rounded-lg text-white">
            <Wallet className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="label-eyebrow leading-none">Valor</p>
            <p className="num truncate text-sm font-semibold tabular-nums text-foreground">
              {cop(c.valor_contrato)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-l border-hairline pl-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: c.plata_en_riesgo ? color : "var(--p3)" }}
          >
            <AlertTriangle className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="label-eyebrow leading-none">{etiquetaRiesgo}</p>
            <p
              className="num truncate text-sm font-semibold tabular-nums"
              style={{ color: c.plata_en_riesgo ? color : "var(--muted-foreground)" }}
            >
              {c.plata_en_riesgo ? cop(c.plata_en_riesgo) : "—"}
            </p>
          </div>
        </div>
      </div>

      {c.valor_verificar && (
        <div className="relative mt-3 inline-flex items-center gap-1.5 self-start rounded-full
                        border border-warn/30 bg-warn-soft px-2.5 py-1 text-[11px] font-medium text-warn">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          Valor reportado inverosímil — verificar en fuente
        </div>
      )}

      <div className="relative mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-xs text-muted-foreground">
          {c.ciudad ?? c.departamento ?? ""}
        </span>
        <span className="num shrink-0 text-xs tabular-nums text-muted-foreground">
          {fecha(c.fecha_firma)}
        </span>
      </div>

      {razon && (
        <p className="relative mt-3 border-t border-hairline pt-3 text-xs italic leading-relaxed text-muted-foreground">
          {razon}
        </p>
      )}
    </Link>
  );
}
