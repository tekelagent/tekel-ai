import Link from "next/link"
import { ExternalLink } from "lucide-react"
import type { Contract } from "@/lib/types"
import { formatCOP, formatDateLong } from "@/lib/format"
import { buttonVariants } from "@/components/ui/button"

function DataItem({ label, value, tone }: { label: string; value: string; tone?: "crit" }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-eyebrow">{label}</span>
      <span
        className="num text-sm font-medium tabular-nums"
        style={{ color: tone === "crit" ? "var(--crit)" : "var(--foreground)" }}
      >
        {value}
      </span>
    </div>
  )
}

export function ContractHeader({
  contract: c,
  analizadoEnVivo,
}: {
  contract: Contract
  analizadoEnVivo?: string
}) {
  return (
    <div className="card-soft p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="num text-xs text-muted-foreground tabular-nums">{c.id_contrato}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground text-balance">
            {c.nombre_entidad}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link
              href={`/contratista/${encodeURIComponent(c.documento_proveedor)}`}
              className="font-medium text-foreground underline decoration-hairline decoration-1 underline-offset-2 transition-colors hover:decoration-[var(--brand-via)] hover:text-[var(--brand-via)]"
            >
              {c.proveedor}
            </Link>{" "}
            · <span className="num tabular-nums">NIT {c.documento_proveedor}</span>
          </p>
          {analizadoEnVivo && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2.5 py-1 text-[11px] font-medium text-warn">
              Analizado en vivo · <span className="num tabular-nums">{analizadoEnVivo}</span>
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={c.url_proceso}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonVariants({ variant: "outline" })} rounded-full`}
          >
            Ver en SECOP
            <ExternalLink className="size-4" />
          </a>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-foreground/85 text-pretty">
        {c.objeto}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-hairline pt-5 sm:grid-cols-3 lg:grid-cols-4">
        <DataItem label="Valor del contrato" value={formatCOP(c.valor_contrato)} />
        <DataItem
          label="Plata en riesgo"
          value={c.plata_en_riesgo != null ? formatCOP(c.plata_en_riesgo) : "—"}
          tone={c.plata_en_riesgo != null ? "crit" : undefined}
        />
        <DataItem label="Estado" value={c.estado_contrato} />
        <DataItem label="Modalidad" value={c.modalidad} />
        <DataItem label="Tipo de contrato" value={c.tipo_de_contrato} />
        <DataItem label="Fecha de firma" value={formatDateLong(c.fecha_firma)} />
        <DataItem label="Ciudad" value={`${c.ciudad}, ${c.departamento}`} />
      </div>
    </div>
  )
}
