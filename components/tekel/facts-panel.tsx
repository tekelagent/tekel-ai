import type { Contract } from "@/lib/types"
import { formatCOP, formatDateLong } from "@/lib/format"
import { cifraClave } from "@/lib/cifra-clave"

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
  const cifra = cifraClave(c, c.vigencia === "historico" ? "historico" : "vigente")
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
        <Row label={cifra.label}>
          {cifra.value != null ? (
            <span className={`num font-semibold ${cifra.destacar ? "text-crit" : ""}`}>
              {formatCOP(cifra.value)}
            </span>
          ) : (
            <span className="text-muted-foreground">Sin cifra verificable</span>
          )}
          {cifra.nota && (
            <p className="mt-1 text-[11px] font-normal leading-snug text-muted-foreground">
              {cifra.nota}
            </p>
          )}
        </Row>
        {/* El desembolso ya ejecutado se muestra aparte de lo que está por
            salir: son dos decisiones distintas, detener o perseguir. */}
        {cifra.label === "Por salir" && (c.pagos_confirmados ?? 0) > 0 && (
          <Row label="Ya desembolsado">
            <span className="num font-semibold">{formatCOP(c.pagos_confirmados!)}</span>
            {c.pagos_ultima_fecha && (
              <p className="mt-1 text-[11px] font-normal leading-snug text-muted-foreground">
                Último pago registrado el {formatDateLong(c.pagos_ultima_fecha)}.
              </p>
            )}
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
