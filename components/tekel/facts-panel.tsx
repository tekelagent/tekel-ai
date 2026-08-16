import type { Contract } from "@/lib/types"
import { formatCOP, formatDateLong } from "@/lib/format"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-hairline py-2.5 last:border-b-0">
      <dt className="label-eyebrow">{label}</dt>
      <dd className="text-[13px] leading-snug text-foreground">{children}</dd>
    </div>
  )
}

/** Ficha técnica del contrato: datos duros verificables. */
export function FactsPanel({ c }: { c: Contract }) {
  return (
    <section
      aria-labelledby="ficha-h"
      className="card-soft p-5"
    >
      <h2 id="ficha-h" className="mb-1 text-sm font-semibold">
        Ficha del contrato
      </h2>
      <dl>
        <Row label="Entidad contratante">{c.nombre_entidad}</Row>
        <Row label="Contratista">
          {c.proveedor}
          <span className="ml-1 num text-muted-foreground">· NIT {c.documento_proveedor}</span>
        </Row>
        <Row label="Valor del contrato">
          <span className="num font-semibold">{formatCOP(c.valor_contrato)}</span>
        </Row>
        {c.plata_en_riesgo != null && (
          <Row
          label={
            c.plata_reportada
              ? "Plata en riesgo estimada"
              : "Valor total · la entidad no reportó ejecución"
          }
        >
            <span className="num font-semibold text-crit">{formatCOP(c.plata_en_riesgo)}</span>
          </Row>
        )}
        <Row label="Tipo · modalidad">
          {c.tipo_de_contrato} · {c.modalidad}
        </Row>
        <Row label="Ubicación">
          {c.ciudad}, {c.departamento}
        </Row>
        <Row label="Estado">{c.estado_contrato}</Row>
        <Row label="Fecha de firma">{formatDateLong(c.fecha_firma)}</Row>
        <Row label="Identificador del proceso">
          <span className="num text-muted-foreground">{c.id_contrato}</span>
        </Row>
      </dl>
    </section>
  )
}
