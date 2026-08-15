/**
 * CONCENTRACION_PROVEEDOR — 20 pts, pesa en contratos históricos.
 *
 * Un mismo proveedor acumula muchos contratos con una misma entidad. No es
 * ilegal ni indica por sí solo una irregularidad —hay proveedores
 * especializados y entidades con pocas alternativas en el mercado— pero es el
 * insumo con el que se dibujan redes entidad-proveedor y se detecta captura.
 *
 * A diferencia de FRACCIONAMIENTO no acota ventana ni cuantía: mide relación
 * acumulada, no una compra partida.
 */
import { severityOf } from "./catalog";
import { formatCOP } from "./format";
import { THRESHOLDS } from "./thresholds";
import { entitySupplierKey } from "./types";
import type { ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "CONCENTRACION_PROVEEDOR" as const;
const POINTS = 20;

export const concentracionProveedor: Rule = {
  code: CODE,

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    const { minContratos } = THRESHOLDS.CONCENTRACION_PROVEEDOR;

    const key = entitySupplierKey(c);
    if (!key) return null;

    const peers = ctx.peersByEntitySupplier.get(key) ?? [];
    if (peers.length < minContratos) return null;

    const valorTotal = peers.reduce((acc, p) => acc + (p.valor_contrato ?? 0), 0);
    const fechas = peers
      .map((p) => p.fecha_firma)
      .filter((f): f is string => Boolean(f))
      .sort();
    const primera = fechas[0] ?? null;
    const ultima = fechas[fechas.length - 1] ?? null;

    const periodo =
      primera && ultima ? ` entre ${primera} y ${ultima}` : "";

    return {
      contract_id: c.id,
      pattern_code: CODE,
      severity: severityOf(CODE),
      points: POINTS,
      detail:
        `El proveedor de este contrato acumula ${peers.length} contratos con ` +
        `${c.nombre_entidad ?? "la misma entidad"}${periodo}, por un total de ` +
        `${formatCOP(valorTotal)}. Una relación comercial concentrada puede ` +
        `responder a especialización legítima o a falta de oferentes en la región; ` +
        `se señala para que la concentración sea visible y verificable, no como ` +
        `indicio de irregularidad por sí misma.`,
      evidence: {
        total_contratos: peers.length,
        umbral_contratos: minContratos,
        valor_total: valorTotal,
        nit_entidad: c.nit_entidad,
        nombre_entidad: c.nombre_entidad,
        documento_proveedor: c.documento_proveedor,
        proveedor: c.proveedor,
        primera_firma: primera,
        ultima_firma: ultima,
      },
      source: "rules",
    };
  },
};
