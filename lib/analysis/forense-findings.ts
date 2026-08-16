/**
 * Convierte el perfil forense de Croma en hallazgos con puntos.
 *
 * Sin esto, la Capa C solo mostraba información: consultaba los registros y los
 * pintaba, pero no movía el score. Aquí es donde la verificación en vivo se
 * vuelve priorización — que es lo que la arquitectura promete.
 *
 * Los patrones que emite son los de más peso del catálogo (45, 40, 40), así que
 * un contratista con una inhabilidad confirmada salta a crítico por sí solo. Por
 * eso cada uno exige evidencia explícita del registro, no una inferencia.
 */
import { citaNormativa } from "../normativa/catalog";
import { focoOf, pointsOf, severityOf } from "../rules/catalog";
import type { Confianza, Finding } from "../rules/types";
import type { PerfilForense } from "../providers/forensic/croma";

/** Días bajo los cuales una empresa se considera recién constituida. */
const DIAS_PROVEEDOR_RECIENTE = 90;

type ContextoContrato = {
  id: string;
  proveedor: string | null;
  fecha_firma: string | null;
};

function hallazgo(
  contractId: string,
  code: "INHABILIDAD_REP_LEGAL" | "MOROSO_BDME" | "PROVEEDOR_RECIENTE",
  confianza: Confianza,
  detail: string,
  evidence: Record<string, unknown>,
): Finding {
  return {
    contract_id: contractId,
    pattern_code: code,
    severity: severityOf(code),
    points: pointsOf(code),
    confianza,
    foco: focoOf(code),
    detail,
    evidence: {
      ...evidence,
      fuente: "Croma — consulta en vivo a registros oficiales",
      // A diferencia de los snapshots PACO, esto es consulta viva con fecha.
      es_snapshot: false,
    },
    source: "croma",
  };
}

/** Días entre dos fechas YYYY-MM-DD. */
function dias(desde: string, hasta: string): number | null {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Deriva los hallazgos de un perfil ya consultado. Función pura: no toca red ni
 * base de datos, así que se usa igual desde el precómputo y desde el análisis
 * interactivo.
 */
export function hallazgosDeForense(
  c: ContextoContrato,
  perfil: PerfilForense,
): Finding[] {
  const out: Finding[] = [];
  const nombre = c.proveedor ?? "El contratista";

  // ── Responsabilidad fiscal (Contraloría) ─────────────────────────────────
  // Figurar en el Boletín produce por sí mismo el efecto inhabilitante
  // mientras dure la inclusión (Ley 610 de 2000 art. 60).
  const contraloria = perfil.contraloria as Record<string, unknown> | null;
  if (contraloria?.is_fiscal_responsible === true) {
    out.push(
      hallazgo(
        c.id,
        "INHABILIDAD_REP_LEGAL",
        "alta",
        `${nombre} figura en el Boletín de Responsables Fiscales de la Contraloría. ` +
          `Estar listado produce por sí mismo el efecto inhabilitante para contratar con ` +
          `el Estado mientras dure la inclusión. Verificado en consulta directa al ` +
          `registro. Criterio: ${citaNormativa("INHABILIDAD_REP_LEGAL")}.`,
        {
          registro: "Contraloría General — responsabilidades fiscales",
          is_fiscal_responsible: true,
          verification_code: contraloria.verification_code ?? null,
          certified_at: contraloria.certified_at ?? null,
          consultado_el: perfil.consultado_el,
        },
      ),
    );
  }

  // ── Antecedentes disciplinarios (Procuraduría) ───────────────────────────
  const procuraduria = perfil.procuraduria as Record<string, unknown> | null;
  const registros = Array.isArray(procuraduria?.records) ? (procuraduria!.records as unknown[]) : [];
  if (procuraduria?.has_records === true && registros.length > 0) {
    out.push(
      hallazgo(
        c.id,
        "INHABILIDAD_REP_LEGAL",
        // La consulta confirma que hay antecedente; su vigencia hay que leerla
        // en el registro, así que no se afirma inhabilidad activa.
        "media",
        `${nombre} registra ${registros.length} antecedente(s) disciplinario(s) en la ` +
          `Procuraduría. Un antecedente no inhabilita por sí solo: hay que verificar si la ` +
          `sanción sigue vigente. Criterio: ${citaNormativa("INHABILIDAD_REP_LEGAL")}.`,
        {
          registro: "Procuraduría General — antecedentes disciplinarios",
          total_antecedentes: registros.length,
          detalle: registros.slice(0, 5),
          vigencia_por_confirmar: true,
          consultado_el: perfil.consultado_el,
        },
      ),
    );
  }

  // ── Boletín de Deudores Morosos del Estado (Contaduría) ──────────────────
  const contaduria = perfil.contaduria as Record<string, unknown> | null;
  if (contaduria && (contaduria.deudor_moroso === true || contaduria.reported === true)) {
    out.push(
      hallazgo(
        c.id,
        "MOROSO_BDME",
        "alta",
        `${nombre} está reportado en el Boletín de Deudores Morosos del Estado. La ` +
          `inclusión en el BDME genera inhabilidad para contratar mientras la deuda esté ` +
          `vigente. Criterio: ${citaNormativa("MOROSO_BDME")}.`,
        {
          registro: "Contaduría General — deudores morosos del Estado",
          deudor_moroso: contaduria.deudor_moroso ?? contaduria.reported,
          incumplimiento_acuerdos: contaduria.incumplimiento_acuerdos ?? null,
          consultado_el: perfil.consultado_el,
        },
      ),
    );
  }

  // ── Empresa recién constituida (RUES) ────────────────────────────────────
  const rues = perfil.rues as Record<string, any> | null;
  const entidad = rues?.entity ?? {};
  const matricula = entidad.fecha_matricula ?? entidad.registration_date ?? null;
  if (rues?.found !== false && matricula && c.fecha_firma) {
    const edad = dias(String(matricula).slice(0, 10), c.fecha_firma);
    if (edad !== null && edad >= 0 && edad < DIAS_PROVEEDOR_RECIENTE) {
      out.push(
        hallazgo(
          c.id,
          "PROVEEDOR_RECIENTE",
          "alta",
          `${nombre} se constituyó ${edad} días antes de la firma de este contrato ` +
            `(matrícula del ${String(matricula).slice(0, 10)}). Una empresa sin trayectoria ` +
            `adjudicataria de un contrato público exige verificar cómo se acreditó su ` +
            `capacidad e idoneidad. Criterio: ${citaNormativa("PROVEEDOR_RECIENTE")}.`,
          {
            registro: "RUES — existencia y representación",
            fecha_matricula: String(matricula).slice(0, 10),
            fecha_firma_contrato: c.fecha_firma,
            dias_antes_de_la_firma: edad,
            umbral_dias: DIAS_PROVEEDOR_RECIENTE,
            consultado_el: perfil.consultado_el,
          },
        ),
      );
    }
  }

  return out;
}
