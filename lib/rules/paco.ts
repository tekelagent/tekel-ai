/**
 * Reglas de Capa A que cruzan contra los snapshots de PACO.
 *
 * El match es SIEMPRE por número de documento exacto, nunca por nombre
 * (METODOLOGIA §6.6): el cruce por nombre produce homonimia y solo los cruces
 * por documento admiten confianza alta.
 *
 * Todas declaran en `evidence` la fuente y la fecha del snapshot: son fotos,
 * no consulta viva. La verificación fresca es Croma en Capa C.
 */
import { citaNormativa } from "../normativa/catalog";
import { ANTECEDENTE_OBRA_MISMA_ENTIDAD_PUNTOS } from "./catalog";
import { makeFinding } from "./finding";
import { formatCOP } from "./format";
import { docDigitos, esComputable, supervisorDoc } from "./types";
import type { Confianza, ContractRow, Finding, Rule, RuleContext } from "./types";

/** Busca en un índice PACO por el documento del contrato. */
function buscar<T>(indice: Map<string, T[]>, doc: string | null): T[] {
  if (!doc) return [];
  return indice.get(doc) ?? [];
}

// ────────────────────────────────────────────────────────────────────────────
// INHABILIDAD_REP_LEGAL — 45 pts, foco ambos.
// Dos fuentes: responsabilidades fiscales (contratista) y SIRI (representante
// legal, y contratista cuando es persona natural).
// ────────────────────────────────────────────────────────────────────────────
export const inhabilidadRepLegal: Rule = {
  code: "INHABILIDAD_REP_LEGAL",

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;

    const docProv = docDigitos(c.documento_proveedor);
    const docRep = docDigitos(c.representante_id);

    const fiscales = buscar(ctx.paco.fiscales, docProv);
    const siriRep = buscar(ctx.paco.siri, docRep);
    const siriProv = buscar(ctx.paco.siri, docProv);
    const siri = [...siriRep, ...siriProv];

    if (!fiscales.length && !siri.length) return null;

    const hoy = ctx.today;
    // Solo se afirma inhabilidad ACTIVA cuando hay fecha que la respalde.
    const siriVigentes = siri.filter((s) => s.vigente_hasta && s.vigente_hasta >= hoy);
    const siriSinPlazo = siri.filter((s) => !s.vigente_hasta);

    const partes: string[] = [];
    let confianza: Confianza = "media";

    if (fiscales.length) {
      // Figurar en el boletín ES el efecto inhabilitante mientras se esté
      // listado (Ley 610 de 2000 art. 60): el match exacto basta.
      confianza = "alta";
      partes.push(
        `El contratista figura en el Boletín de Responsables Fiscales de la ` +
          `Contraloría (${fiscales.length} registro${fiscales.length > 1 ? "s" : ""}). ` +
          `Estar listado produce por sí mismo el efecto inhabilitante mientras dure ` +
          `la inclusión.`,
      );
    }

    if (siriVigentes.length) {
      confianza = "alta";
      const s = siriVigentes[0];
      partes.push(
        `Hay una sanción disciplinaria de tipo "${s.sancion}" con vigencia hasta ` +
          `${s.vigente_hasta}, registrada el ${s.fecha_providencia}.`,
      );
    } else if (siriSinPlazo.length) {
      const s = siriSinPlazo[0];
      partes.push(
        `Hay un antecedente disciplinario registrado ("${s.sancion}", ` +
          `${s.fecha_providencia}); la sanción no declara plazo, así que su ` +
          `vigencia está por confirmar.`,
      );
    } else if (siri.length) {
      partes.push(
        `Hay antecedentes disciplinarios registrados, todos con vigencia ya vencida ` +
          `según la fecha del snapshot.`,
      );
    }

    // Sin fiscales y con SIRI vencido, no hay señal que sostener.
    if (!fiscales.length && !siriVigentes.length && !siriSinPlazo.length) return null;

    return makeFinding({
      contract: c,
      code: "INHABILIDAD_REP_LEGAL",
      confianza,
      detail: `${partes.join(" ")} Criterio: ${citaNormativa("INHABILIDAD_REP_LEGAL")}.`,
      evidence: {
        fuente: "PACO — snapshots de Contraloría (responsabilidades fiscales) y Procuraduría (SIRI)",
        snapshot_fecha: fiscales[0]?.snapshot_fecha ?? siri[0]?.snapshot_fecha ?? null,
        es_snapshot: true,
        verificacion_viva: "Croma SIRI/Contraloría en Capa C",
        fiscales_matches: fiscales.length,
        fiscales_entidades: fiscales.slice(0, 5).map((f) => f.entidad_afectada),
        siri_por_representante: siriRep.length,
        siri_por_proveedor: siriProv.length,
        siri_vigentes: siriVigentes.length,
        siri_sin_plazo: siriSinPlazo.length,
        siri_detalle: siri.slice(0, 5).map((s) => ({
          sancion: s.sancion,
          fecha: s.fecha_providencia,
          vigente_hasta: s.vigente_hasta,
        })),
        documento_proveedor: docProv,
        representante_id: docRep,
      },
    });
  },
};

// ────────────────────────────────────────────────────────────────────────────
// SANCIONES_PREVIAS — 25 pts, foco contratista. Multas SECOP.
// ────────────────────────────────────────────────────────────────────────────
export const sancionesPrevias: Rule = {
  code: "SANCIONES_PREVIAS",

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;
    const doc = docDigitos(c.documento_proveedor);
    const multas = buscar(ctx.paco.multas, doc);
    if (!multas.length) return null;

    const total = multas.reduce((a, m) => a + (m.valor_multa ?? 0), 0);
    const fechas = multas.map((m) => m.fecha).filter(Boolean).sort();

    return makeFinding({
      contract: c,
      code: "SANCIONES_PREVIAS",
      // Match por documento exacto contra un acto administrativo publicado.
      confianza: "alta",
      detail:
        `El contratista tiene ${multas.length} multa${multas.length > 1 ? "s" : ""} o ` +
        `sanción${multas.length > 1 ? "es" : ""} contractual${multas.length > 1 ? "es" : ""} ` +
        `registrada${multas.length > 1 ? "s" : ""} en SECOP, por ${formatCOP(total)} en total` +
        (fechas.length ? `, entre ${fechas[0]} y ${fechas[fechas.length - 1]}` : "") +
        `. Una sanción previa no inhabilita, pero es antecedente de cumplimiento ` +
        `que la entidad debía valorar al contratar. Criterio: ${citaNormativa("SANCIONES_PREVIAS")}.`,
      evidence: {
        fuente: "PACO — multas y sanciones contractuales SECOP",
        snapshot_fecha: multas[0].snapshot_fecha,
        es_snapshot: true,
        total_multas: multas.length,
        valor_total: total,
        detalle: multas.slice(0, 5).map((m) => ({
          entidad: m.entidad,
          resolucion: m.resolucion,
          valor: m.valor_multa,
          fecha: m.fecha,
        })),
        documento_proveedor: doc,
      },
    });
  },
};

// ────────────────────────────────────────────────────────────────────────────
// COLUSION_PREVIA — 45 pts, foco contratista. Colusiones sancionadas por la SIC.
// ────────────────────────────────────────────────────────────────────────────
export const colusionPrevia: Rule = {
  code: "COLUSION_PREVIA",

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;
    const doc = docDigitos(c.documento_proveedor);
    const casos = buscar(ctx.paco.colusiones, doc);
    if (!casos.length) return null;

    const total = casos.reduce((a, k) => a + (k.multa_inicial ?? 0), 0);

    return makeFinding({
      contract: c,
      code: "COLUSION_PREVIA",
      confianza: "alta",
      detail:
        `El contratista fue sancionado por la Superintendencia de Industria y ` +
        `Comercio por colusión en contratación pública: acordar con otros oferentes ` +
        `el resultado de una licitación. ${casos.length} caso` +
        `${casos.length > 1 ? "s" : ""}, con multas por ${formatCOP(total)}. ` +
        `Criterio: ${citaNormativa("COLUSION_PREVIA")}.`,
      evidence: {
        fuente: "PACO — colusiones en contratación pública (SIC)",
        snapshot_fecha: casos[0].snapshot_fecha,
        es_snapshot: true,
        casos: casos.map((k) => ({
          caso: k.caso,
          resolucion: k.resolucion_sancion,
          multa: k.multa_inicial,
        })),
        documento_proveedor: doc,
      },
    });
  },
};

// ────────────────────────────────────────────────────────────────────────────
// ANTECEDENTE_OBRA_INCONCLUSA — 25 pts, o 35 si es la MISMA entidad.
// ────────────────────────────────────────────────────────────────────────────
export const antecedenteObraInconclusa: Rule = {
  code: "ANTECEDENTE_OBRA_INCONCLUSA",

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;
    const doc = docDigitos(c.documento_proveedor);
    const obras = buscar(ctx.paco.obras, doc);
    if (!obras.length) return null;

    const nitEntidad = docDigitos(c.nit_entidad);
    // ¿Alguna de las obras inconclusas es con la misma entidad que hoy contrata?
    const mismaEntidad = obras.filter((o) => {
      const n = docDigitos(o.nit_entidad);
      return n && nitEntidad && (n === nitEntidad || n.startsWith(nitEntidad));
    });
    const esMismaEntidad = mismaEntidad.length > 0;

    const total = obras.reduce((a, o) => a + (o.valor_contrato ?? 0), 0);

    const frase = esMismaEntidad
      ? `La misma entidad que registró la obra inconclusa volvió a contratarlo: ` +
        `${c.nombre_entidad ?? "la entidad"} tiene ${mismaEntidad.length} obra` +
        `${mismaEntidad.length > 1 ? "s" : ""} sin terminar a cargo de este contratista, ` +
        `y aun así le adjudicó este contrato.`
      : `El contratista figura en el Registro Nacional de Obras Civiles Inconclusas ` +
        `por ${obras.length} obra${obras.length > 1 ? "s" : ""} con otras entidades.`;

    return makeFinding({
      contract: c,
      code: "ANTECEDENTE_OBRA_INCONCLUSA",
      points: esMismaEntidad ? ANTECEDENTE_OBRA_MISMA_ENTIDAD_PUNTOS : undefined,
      confianza: "alta",
      detail:
        `${frase} Las obras suman ${formatCOP(total)}. Figurar en el registro no ` +
        `inhabilita, pero es antecedente directo de incumplimiento. ` +
        `Criterio: ${citaNormativa("ANTECEDENTE_OBRA_INCONCLUSA")}.`,
      evidence: {
        fuente: "PACO — Registro Nacional de Obras Civiles Inconclusas",
        snapshot_fecha: obras[0].snapshot_fecha,
        es_snapshot: true,
        match_por: "documento del contratista",
        // El registro usa códigos SECOP I / pre-CO1: el match por código de
        // contrato no es posible contra este corpus (METODOLOGIA §7).
        match_por_codigo_secop_no_disponible: true,
        misma_entidad_contratante: esMismaEntidad,
        obras_totales: obras.length,
        obras_misma_entidad: mismaEntidad.length,
        valor_total_obras: total,
        detalle: obras.slice(0, 5).map((o) => ({
          entidad: o.entidad,
          objeto: o.objeto,
          valor: o.valor_contrato,
          estado: o.estado,
        })),
        documento_proveedor: doc,
      },
    });
  },
};

// ────────────────────────────────────────────────────────────────────────────
// MISMO_SUPERVISOR — 15 pts, foco entidad. Agravante puro.
// ────────────────────────────────────────────────────────────────────────────
export const mismoSupervisor: Rule = {
  code: "MISMO_SUPERVISOR",

  run(c: ContractRow, ctx: RuleContext): Finding | null {
    if (!esComputable(c)) return null;
    const sup = supervisorDoc(c);
    const prov = docDigitos(c.documento_proveedor);
    if (!sup || !prov) return null;

    const par = ctx.supervisorProveedor.get(`${sup}|${prov}`);
    if (!par || par.contratos < ctx.mismoSupervisorMin) return null;

    const ratio = par.totalSupervisados > 0 ? par.contratos / par.totalSupervisados : 0;

    return makeFinding({
      contract: c,
      code: "MISMO_SUPERVISOR",
      // Alta si el proveedor domina la cartera del supervisor.
      confianza: ratio >= 1 / 3 ? "alta" : "media",
      detail:
        `La misma persona supervisa ${par.totalSupervisados} contratos en esta ` +
        `entidad, y ${par.contratos} de ellos son del mismo proveedor ` +
        `(${(ratio * 100).toFixed(0)}%), por ${formatCOP(par.valorTotal)} en total. ` +
        `Que una sola persona concentre el control de un mismo contratista no es ` +
        `irregular por sí mismo, pero concentra también el riesgo de que el control ` +
        `falle. Por sí sola esta señal no prioriza el contrato. ` +
        `Criterio: ${citaNormativa("MISMO_SUPERVISOR")}.`,
      evidence: {
        supervisor_documento: sup,
        contratos_del_par: par.contratos,
        total_supervisados_por_esa_persona: par.totalSupervisados,
        ratio: Number(ratio.toFixed(4)),
        valor_total_del_par: par.valorTotal,
        umbral_minimo: ctx.mismoSupervisorMin,
        // El umbral es relativo al corpus ingestado; con el universo completo
        // se reevalúa al alza.
        umbral_relativo_al_corpus: true,
        contratos: par.ids.slice(0, 10),
        documento_proveedor: prov,
        solo_agravante: true,
      },
    });
  },
};
