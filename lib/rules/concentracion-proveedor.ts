/**
 * CONCENTRACION_PROVEEDOR — 20 pts, foco ambos.
 * METODOLOGIA §3: Ley 80 art. 24, principio de selección objetiva.
 *
 * Dos disparadores alternativos (METODOLOGIA §3):
 *   (a) ≥8 contratos del mismo proveedor con la misma entidad
 *   (b) ≥30% del valor contratado por esa entidad en 24 meses
 *
 * No es ilegal ni indica por sí solo una irregularidad —hay proveedores
 * especializados y entidades con pocas alternativas en el mercado local— pero es
 * el insumo con el que se dibujan redes entidad-proveedor y se detecta captura.
 *
 * NOTA DE ALCANCE: el corpus es una muestra del universo SECOP, no el universo.
 * Eso hace que las dos condiciones tengan confianza distinta:
 *   - el CONTEO es un piso: si en la muestra ya hay 8, en la realidad hay ≥8.
 *     Confianza alta.
 *   - la FRACCIÓN tiene numerador y denominador parciales, así que puede estar
 *     sesgada en cualquier dirección. Confianza baja, y se declara.
 */
import { citaNormativa } from "../normativa/catalog";
import { makeFinding } from "./finding";
import { daysBetween, formatCOP, formatPct } from "./format";
import { THRESHOLDS } from "./thresholds";
import { entitySupplierKey, esComputable } from "./types";
import type { Confianza, ContractRow, Finding, Rule, RuleContext } from "./types";

const CODE = "CONCENTRACION_PROVEEDOR" as const;

export const concentracionProveedor: Rule = {
  code: CODE,

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;

    const { minContratos, fraccionValorEntidad, ventanaValorDias } =
      THRESHOLDS.CONCENTRACION_PROVEEDOR;

    const key = entitySupplierKey(c);
    if (!key) return null;

    const peers = (ctx.peersByEntitySupplier.get(key) ?? []).filter(esComputable);
    if (!peers.length) return null;

    // (a) conteo
    const porConteo = peers.length >= minContratos;

    // (b) fracción del valor contratado por la entidad en la ventana
    const valorEntidad = ctx.valorPorEntidad24m.get(c.nit_entidad!) ?? 0;
    const valorProveedorVentana = peers
      .filter((p) => {
        const d = daysBetween(p.fecha_firma, ctx.today);
        return d !== null && d >= 0 && d <= ventanaValorDias;
      })
      .reduce((acc, p) => acc + (p.valor_contrato ?? 0), 0);
    const fraccion = valorEntidad > 0 ? valorProveedorVentana / valorEntidad : 0;
    const porFraccion = valorEntidad > 0 && fraccion >= fraccionValorEntidad;

    if (!porConteo && !porFraccion) return null;

    const condicion: "conteo" | "fraccion" | "ambas" =
      porConteo && porFraccion ? "ambas" : porConteo ? "conteo" : "fraccion";
    // El conteo es un piso verificable; la fracción depende de un corpus parcial.
    const confianza: Confianza = porConteo ? "alta" : "baja";

    const valorTotal = peers.reduce((acc, p) => acc + (p.valor_contrato ?? 0), 0);
    const fechas = peers
      .map((p) => p.fecha_firma)
      .filter((f): f is string => Boolean(f))
      .sort();
    const primera = fechas[0] ?? null;
    const ultima = fechas[fechas.length - 1] ?? null;

    const fraseConteo =
      `acumula ${peers.length} contratos con ${c.nombre_entidad ?? "la misma entidad"}` +
      (primera && ultima ? ` entre ${primera} y ${ultima}` : "") +
      `, por un total de ${formatCOP(valorTotal)}`;
    const fraseFraccion =
      `concentra el ${formatPct(fraccion)} de lo que esa entidad contrató en los ` +
      `últimos 24 meses dentro de este corpus`;

    const cuerpo =
      condicion === "ambas"
        ? `${fraseConteo}, y ${fraseFraccion}`
        : condicion === "conteo"
          ? fraseConteo
          : fraseFraccion;

    return makeFinding({
      contract: c,
      code: CODE,
      confianza,
      detail:
        `El proveedor de este contrato ${cuerpo}. Una relación comercial concentrada ` +
        `puede responder a especialización legítima o a falta de oferentes en la ` +
        `región; se señala para que la concentración sea visible y verificable, no ` +
        `como indicio de irregularidad por sí misma. ` +
        (condicion !== "conteo"
          ? `El porcentaje se calcula sobre el corpus ingestado, que es una muestra de ` +
            `SECOP, no el universo completo. `
          : "") +
        `Criterio: ${citaNormativa(CODE)}.`,
      evidence: {
        condicion,
        total_contratos: peers.length,
        umbral_contratos: minContratos,
        valor_total: valorTotal,
        valor_proveedor_ventana: valorProveedorVentana,
        valor_entidad_ventana: valorEntidad,
        fraccion_del_valor_entidad: Number(fraccion.toFixed(4)),
        fraccion_minima_exigida: fraccionValorEntidad,
        ventana_valor_dias: ventanaValorDias,
        // El corpus es una muestra: el conteo es un piso, la fracción es estimada.
        corpus_parcial: true,
        nit_entidad: c.nit_entidad,
        nombre_entidad: c.nombre_entidad,
        documento_proveedor: c.documento_proveedor,
        proveedor: c.proveedor,
        primera_firma: primera,
        ultima_firma: ultima,
      },
    });
  },
};
