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

/**
 * La etiqueta cambia según de dónde salga la cifra. No es cosmética: decir
 * "plata en riesgo" cuando no hay rastro de pagos afirma un hecho que el dato
 * no sostiene.
 */
const ETIQUETA_PLATA: Record<Contract["plata_procedencia"], string> = {
  corroborado: "Plata en riesgo · verificada contra el plan de pagos",
  reportado: "Plata en riesgo estimada",
  sin_rastro: "Valor total · sin rastro de pagos",
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
          <Row label={ETIQUETA_PLATA[c.plata_procedencia]}>
            <span className="num font-semibold text-crit">{formatCOP(c.plata_en_riesgo)}</span>
            {c.plata_procedencia === "corroborado" && (
              <p className="mt-1 text-[11px] font-normal leading-snug text-muted-foreground">
                Contrastado con el plan de pagos de SECOP: {c.pagos_filas}{" "}
                {c.pagos_filas === 1 ? "factura registrada" : "facturas registradas"}
                {c.pagos_ultima_fecha
                  ? `, último desembolso el ${formatDateLong(c.pagos_ultima_fecha)}`
                  : ", ninguna pagada"}
                .
              </p>
            )}
            {c.plata_procedencia === "sin_rastro" && (
              <p className="mt-1 text-[11px] font-normal leading-snug text-muted-foreground">
                No hay pagos reportados por la entidad ni facturas en el plan de pagos de
                SECOP. La cifra es el valor total del contrato, no un pendiente confirmado.
              </p>
            )}
          </Row>
        )}
        {c.pagos_en_tramite != null && c.pagos_en_tramite > 0 && (
          <Row label="Facturado pendiente de desembolso">
            <span className="num font-semibold">{formatCOP(c.pagos_en_tramite)}</span>
            <p className="mt-1 text-[11px] font-normal leading-snug text-muted-foreground">
              Facturas aprobadas o radicadas que aún no se han pagado. Es la plata más
              próxima a salir.
            </p>
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
