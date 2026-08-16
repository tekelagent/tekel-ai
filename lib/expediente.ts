/**
 * Expediente de Priorización — METODOLOGIA §5.
 *
 * Ensambla la salida por contrato en el formato de hallazgo de auditoría:
 * condición-criterio-efecto. Deliberadamente NO afirma "causa": establecer la
 * causa es trabajo del investigador, no del motor.
 *
 * Todo lo normativo se lee del catálogo (`lib/normativa`), nunca se genera.
 */
import {
  CATALOGO_NORMATIVO_VERSION,
  citaNormativa,
  criterioDe,
  type PatternCode,
} from "./normativa/catalog";
import { PATTERNS } from "./rules/catalog";
import { formatCOP } from "./rules/format";
import { triar, type Prioridad } from "./rules/priority";
import type { Confianza, ContractRow, Finding, Foco } from "./rules/types";

export const AVISO_LEGAL =
  "Indicadores de riesgo verificables en fuentes oficiales. No constituye " +
  "imputación ni prueba de responsabilidad.";

export const AVISO_VALOR_INVEROSIMIL =
  "Valor reportado inverosímil según SECOP — verificar en la fuente.";

export type HallazgoExpediente = {
  pattern_code: string;
  /** Puntos que este hallazgo aporta al score. Sin esto la UI no puede
   *  explicar de dónde sale el número, que es justo lo que lo hace auditable. */
  points: number;
  severity: string;
  /** Qué capa lo produjo: regla determinista, registro oficial o IA. */
  source: string;
  /** Qué muestran los datos, en cifras exactas y español claro. */
  condicion: string;
  /** Norma del catálogo. Nunca texto generado. */
  criterio: { norma: string; articulo: string | null; sintesis: string; cita: string };
  /** Cuantificación del efecto potencial. */
  efecto_potencial: string;
  confianza: Confianza;
  foco: Foco;
  /** true si la regla opera sobre un proxy y no sobre la magnitud de la norma. */
  aproximacion: boolean;
  evidence: Record<string, unknown>;
};

export type Expediente = {
  encabezado: {
    id_contrato: string;
    entidad: string | null;
    nit_entidad: string | null;
    contratista: string | null;
    documento_proveedor: string | null;
    objeto: string | null;
    valor_contrato: number | null;
    estado: string | null;
    vigencia: string;
    url_secop: string | null;
    avisos: string[];
  };
  triaje: {
    prioridad: Prioridad | null;
    risk_score: number;
    risk_level: string;
    plata_en_riesgo: number | null;
    porque_ahora: string[];
  };
  hallazgos: HallazgoExpediente[];
  /** Capa C. Vacío mientras Croma no esté conectado. */
  perfil_forense: { disponible: false; motivo: string };
  lineas_de_verificacion: string[];
  trazabilidad: {
    generado_el: string;
    catalogo_normativo_version: string;
    fuente_datos: string;
    capas_aplicadas: string[];
  };
  aviso: string;
};

/**
 * Qué documentos pedir según el patrón detectado (METODOLOGIA §5.5).
 * Son las preguntas concretas que un auditor llevaría a la entidad.
 */
const VERIFICACION_POR_PATRON: Partial<Record<PatternCode, string[]>> = {
  DESEQUILIBRIO_PAGOS: [
    "Informes de supervisión e interventoría de los meses en que se hicieron los desembolsos.",
    "Actas de recibo parcial que respalden cada pago girado.",
    "Cronograma de ejecución aprobado y su comparación con el avance reportado.",
  ],
  ADICIONES_50: [
    "Otrosí o acta de modificación, con el valor inicial y el valor adicionado desglosados.",
    "Justificación técnica y jurídica de la adición.",
    "Certificado de disponibilidad presupuestal que respalde el mayor valor.",
  ],
  VALOR_ATIPICO: [
    "Estudios previos y análisis del sector que sustentan la estimación del valor.",
    "Cotizaciones o precios de referencia usados para fijar el presupuesto oficial.",
  ],
  EJECUCION_ANOMALA: [
    "Acta de liquidación del contrato, o constancia de por qué no se ha liquidado.",
    "Informe final de supervisión con el balance de lo efectivamente ejecutado.",
    "Soportes de las sumas reportadas como pendientes de ejecución.",
  ],
  FRACCIONAMIENTO: [
    "Plan Anual de Adquisiciones de la vigencia, para ver si los objetos estaban previstos juntos.",
    "Estudios previos de cada contrato del grupo, para comparar su justificación.",
    "Análisis del sector que explique por qué se contrató por separado.",
  ],
  CONCENTRACION_PROVEEDOR: [
    "Listado de invitaciones y propuestas recibidas en cada proceso con este proveedor.",
    "Estudios de mercado que muestren qué otros oferentes existían en la región.",
  ],
  PAGO_ADELANTADO_RIESGO: [
    "Contrato de fiducia o patrimonio autónomo que administra el anticipo (Ley 1474 art. 91).",
    "Plan de inversión del anticipo y sus informes de amortización.",
  ],
  DICIEMBRE: [
    "Plan Anual de Adquisiciones, para verificar si la necesidad estaba planeada.",
    "Certificado de disponibilidad presupuestal y su fecha de expedición.",
  ],
  OBJETO_DIFUSO: [
    "Estudios previos con la descripción detallada del alcance y los entregables.",
    "Anexo técnico del contrato.",
  ],
};

/** Efecto potencial cuantificado, en la moneda del contrato. */
function efectoPotencial(c: ContractRow, plata: number | null): string {
  if (c.valor_verificar) {
    return "No cuantificable: el valor reportado en SECOP es inverosímil y debe verificarse en la fuente.";
  }
  if (plata === null) return "No cuantificable con los datos publicados.";
  if (c.vigencia === "vigente") {
    return `Hasta ${formatCOP(plata)} aún no desembolsados, que una intervención temprana podría detener.`;
  }
  return `Hasta ${formatCOP(plata)} ya desembolsados, techo del posible detrimento patrimonial.`;
}

/** Ensambla el expediente desde el contrato y sus hallazgos. */
export function construirExpediente(
  c: ContractRow,
  findings: readonly Finding[],
  opts: { today: string; pisoMaterialidad?: number; generadoEl?: string },
): Expediente {
  const t = triar(c, findings, opts);

  const avisos: string[] = [];
  if (c.valor_verificar) avisos.push(AVISO_VALOR_INVEROSIMIL);
  if (c.vigencia === "otro") {
    avisos.push("El contrato no llegó a ejecutarse: queda fuera del triaje.");
  }

  const hallazgos: HallazgoExpediente[] = findings.map((f) => {
    const code = f.pattern_code as PatternCode;
    const criterio = criterioDe(code);
    return {
      pattern_code: f.pattern_code,
      points: f.points,
      severity: f.severity,
      source: f.source,
      condicion: f.detail,
      criterio: criterio
        ? {
            norma: criterio.norma,
            articulo: criterio.articulo,
            sintesis: criterio.sintesis,
            cita: citaNormativa(code),
          }
        : {
            norma: "Sin criterio en el catálogo",
            articulo: null,
            sintesis: "",
            cita: "",
          },
      efecto_potencial: efectoPotencial(c, t.plata_en_riesgo),
      confianza: f.confianza,
      foco: f.foco,
      aproximacion: f.evidence?.aproximacion === true,
      evidence: f.evidence,
    };
  });

  // Líneas de verificación: unión de las que pide cada patrón presente, sin
  // repetir. Si dos patrones piden el mismo documento, se pide una vez.
  const lineas = new Set<string>();
  for (const f of findings) {
    for (const l of VERIFICACION_POR_PATRON[f.pattern_code as PatternCode] ?? []) {
      lineas.add(l);
    }
  }
  if (c.url_proceso) {
    lineas.add(`Contrastar todo lo anterior con el expediente publicado en SECOP: ${c.url_proceso}`);
  }

  const capas = [...new Set(findings.map((f) => f.source))];

  return {
    encabezado: {
      id_contrato: c.id_contrato,
      entidad: c.nombre_entidad,
      nit_entidad: c.nit_entidad,
      contratista: c.proveedor,
      documento_proveedor: c.documento_proveedor,
      objeto: c.objeto,
      valor_contrato: c.valor_contrato,
      estado: c.estado_contrato,
      vigencia: c.vigencia,
      url_secop: c.url_proceso,
      avisos,
    },
    triaje: {
      prioridad: t.prioridad,
      risk_score: t.risk_score,
      risk_level: t.risk_level,
      plata_en_riesgo: t.plata_en_riesgo,
      porque_ahora: t.porque_ahora,
    },
    hallazgos,
    perfil_forense: {
      disponible: false,
      motivo:
        "La Capa C (Croma: RUES, SIRI/SIBOR, BDME, sanciones SECOP) aún no está conectada.",
    },
    lineas_de_verificacion: [...lineas],
    trazabilidad: {
      generado_el: opts.generadoEl ?? new Date().toISOString(),
      catalogo_normativo_version: CATALOGO_NORMATIVO_VERSION,
      fuente_datos: "SECOP II — datos.gov.co, dataset jbjy-vk9h",
      capas_aplicadas: capas.length ? capas : ["ninguna"],
    },
    aviso: AVISO_LEGAL,
  };
}

/** Render en texto plano para consola. La UI consumirá el objeto, no esto. */
export function renderExpediente(e: Expediente): string {
  const L: string[] = [];
  const linea = (ch = "─") => ch.repeat(78);
  const titulo = (t: string) => {
    L.push("");
    L.push(linea("═"));
    L.push(`  ${t.toUpperCase()}`);
    L.push(linea("═"));
  };

  titulo("Expediente de priorización");
  const h = e.encabezado;
  L.push(`  Contrato:    ${h.id_contrato}`);
  L.push(`  Entidad:     ${h.entidad ?? "—"}  (NIT ${h.nit_entidad ?? "—"})`);
  L.push(`  Contratista: ${h.contratista ?? "—"}  (doc. ${h.documento_proveedor ?? "—"})`);
  L.push(`  Valor:       ${h.valor_contrato !== null ? formatCOP(h.valor_contrato) : "—"}`);
  L.push(`  Estado:      ${h.estado ?? "—"}  ·  vigencia: ${h.vigencia}`);
  L.push(`  Objeto:      ${(h.objeto ?? "—").slice(0, 300)}`);
  L.push(`  SECOP:       ${h.url_secop ?? "—"}`);
  for (const a of h.avisos) L.push(`  ⚠  ${a}`);

  titulo(`Prioridad ${e.triaje.prioridad ?? "sin prioridad"} — por qué ahora`);
  L.push(`  Score: ${e.triaje.risk_score}/100  (${e.triaje.risk_level})`);
  L.push(
    `  Plata en riesgo: ${e.triaje.plata_en_riesgo !== null ? formatCOP(e.triaje.plata_en_riesgo) : "no cuantificable"}`,
  );
  L.push("");
  for (const r of e.triaje.porque_ahora) L.push(`  · ${r}`);
  if (!e.triaje.porque_ahora.length) L.push("  (sin razones: el contrato no entra al triaje)");

  titulo(`Hallazgos (${e.hallazgos.length})`);
  e.hallazgos.forEach((f, i) => {
    const pts = PATTERNS[f.pattern_code as PatternCode]?.points ?? "?";
    L.push("");
    L.push(`  ${i + 1}. ${f.pattern_code}   ${pts} pts   confianza ${f.confianza}   foco ${f.foco}`);
    if (f.aproximacion) L.push(`     ⚠  Medida aproximada: ver evidence.aproximacion_motivo`);
    L.push(linea("-"));
    L.push(`     CONDICIÓN`);
    for (const l of envolver(f.condicion, 68)) L.push(`       ${l}`);
    L.push(`     CRITERIO`);
    L.push(`       ${f.criterio.cita}`);
    for (const l of envolver(f.criterio.sintesis, 68)) L.push(`       ${l}`);
    L.push(`     EFECTO POTENCIAL`);
    for (const l of envolver(f.efecto_potencial, 68)) L.push(`       ${l}`);
  });

  titulo("Perfil forense del contratista");
  L.push(`  No disponible. ${e.perfil_forense.motivo}`);

  titulo("Líneas de verificación sugeridas");
  e.lineas_de_verificacion.forEach((l, i) => {
    const envuelto = envolver(l, 72);
    L.push(`  ${String(i + 1).padStart(2)}. ${envuelto[0]}`);
    for (const resto of envuelto.slice(1)) L.push(`      ${resto}`);
  });

  titulo("Trazabilidad");
  L.push(`  Generado:            ${e.trazabilidad.generado_el}`);
  L.push(`  Catálogo normativo:  v${e.trazabilidad.catalogo_normativo_version}`);
  L.push(`  Fuente de datos:     ${e.trazabilidad.fuente_datos}`);
  L.push(`  Capas aplicadas:     ${e.trazabilidad.capas_aplicadas.join(", ")}`);

  L.push("");
  L.push(linea("═"));
  for (const l of envolver(e.aviso, 74)) L.push(`  ${l}`);
  L.push(linea("═"));

  return L.join("\n");
}

/** Envuelve texto a un ancho dado, sin cortar palabras. */
function envolver(texto: string, ancho: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let actual = "";
  for (const p of palabras) {
    if (actual.length + p.length + 1 > ancho) {
      if (actual) out.push(actual);
      actual = p;
    } else {
      actual = actual ? `${actual} ${p}` : p;
    }
  }
  if (actual) out.push(actual);
  return out.length ? out : [""];
}
