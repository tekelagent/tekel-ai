/**
 * Triaje P1/P2/P3 — METODOLOGIA §4.
 *
 * El score mide GRAVEDAD. La prioridad añade tres cosas que el score no sabe:
 * urgencia (¿el dinero todavía se puede parar?), materialidad (¿la cuantía
 * justifica movilizar a un equipo?) y corroboración (¿convergen señales
 * independientes, o es una sola señal débil repetida?).
 *
 * Regla de corroboración: dos hallazgos de la misma familia normativa cuentan
 * como uno. Y los patrones marcados `soloAgravante` —DICIEMBRE,
 * PAGO_ADELANTADO_RIESGO— no cuentan para independencia en absoluto: agravan,
 * no priorizan.
 */
import { esSoloAgravante, familiaOf, INHABILIDADES, type PatternCode } from "./catalog";
import { formatCOP } from "./format";
import { levelOf, scoreOf } from "./score";
import { PISO_MATERIALIDAD_COP, PRIORIDAD } from "./thresholds";
import { esComputable } from "./types";
import type { ContractRow, Finding } from "./types";

export type Prioridad = "P1" | "P2" | "P3";

export type Triaje = {
  risk_score: number;
  risk_level: "bajo" | "medio" | "critico";
  /** null = no entra al triaje (score bajo, o contrato no computable). */
  prioridad: Prioridad | null;
  /** null = no calculable de forma creíble. */
  plata_en_riesgo: number | null;
  /** Razones en español compuestas desde los datos. Vacío si no hay prioridad. */
  porque_ahora: string[];
};

const DIAS_POR_ANIO = 365.25;

/**
 * Plata en riesgo (METODOLOGIA §4).
 *   vigentes:   lo que aún no se ha desembolsado y por tanto se puede detener
 *   históricos: lo ya pagado, como techo del posible detrimento
 *
 * Devuelve null cuando el valor reportado es inverosímil: un agregado con esas
 * cifras no sería defendible ante un auditor (METODOLOGIA §6.8).
 */
export function plataEnRiesgo(c: ContractRow): number | null {
  return detallePlataEnRiesgo(c).valor;
}

/**
 * De dónde sale la cifra de plata en riesgo. Determina qué se puede afirmar.
 *
 *   `reportado`    la entidad reportó ejecución en el dataset de contratos.
 *   `corroborado`  el plan de pagos (uymx-8p3j) confirma el estado de
 *                  desembolso factura por factura. Es la evidencia más fuerte.
 *   `sin_rastro`   ni pagos reportados ni plan de pagos. No se afirma nada.
 */
export type ProcedenciaPlata = "reportado" | "corroborado" | "sin_rastro";

/**
 * Plata en riesgo con su procedencia.
 *
 * El problema que resuelve: 12.784 contratos vigentes reportan
 * `valor_pagado = 0`, y 7.929 de ellos están "En ejecución". Leído solo contra
 * el dataset de contratos, ese cero es ambiguo — puede ser "no se ha pagado" o
 * "la entidad no reportó" — y tratarlo como lo primero sería afirmar un hecho
 * que el dato no sostiene (METODOLOGIA §6.1).
 *
 * El plan de pagos de SECOP II lo desambigua. Validación sobre 400 contratos
 * (scripts/probe-pagos.ts): en los que SÍ reportan pago, la suma de facturas
 * en estado "Pagado" coincide con `valor_pagado` al peso. La fuente es fiel,
 * así que su silencio también significa algo: si hay plan de pagos y ninguna
 * factura pagada, el cero es real y ahora sí se puede afirmar.
 */
export function detallePlataEnRiesgo(c: ContractRow): {
  valor: number | null;
  procedencia: ProcedenciaPlata;
  /** Facturado que ya está aprobado o radicado y todavía no ha salido. */
  enTramite: number | null;
} {
  const nada = { valor: null, procedencia: "sin_rastro" as const, enTramite: null };
  if (c.valor_verificar) return nada;
  if (c.vigencia === "otro") return nada;

  // El plan de pagos manda cuando existe: es evidencia por factura, con fecha.
  const conPlan = typeof c.pagos_filas === "number" && c.pagos_filas > 0;
  const confirmados = typeof c.pagos_confirmados === "number" ? c.pagos_confirmados : null;
  const enTramite = typeof c.pagos_en_tramite === "number" ? c.pagos_en_tramite : null;

  if (c.vigencia === "historico") {
    if (conPlan && confirmados !== null) {
      return { valor: confirmados, procedencia: "corroborado", enTramite };
    }
    const pagado = typeof c.valor_pagado === "number" && c.valor_pagado >= 0 ? c.valor_pagado : null;
    return {
      valor: pagado,
      procedencia: pagado !== null && pagado > 0 ? "reportado" : "sin_rastro",
      enTramite: null,
    };
  }

  const valor = typeof c.valor_contrato === "number" ? c.valor_contrato : null;
  const pagado = typeof c.valor_pagado === "number" ? c.valor_pagado : null;
  const pendiente =
    typeof c.valor_pendiente_ejecucion === "number" ? c.valor_pendiente_ejecucion : null;

  if (conPlan && valor !== null && confirmados !== null) {
    const resto = valor - confirmados;
    return { valor: resto > 0 ? resto : 0, procedencia: "corroborado", enTramite };
  }

  // Sin plan de pagos: se vuelve al dataset de contratos, y su cero es ambiguo.
  const sinEjecucionReportada =
    (pagado === null || pagado === 0) && (pendiente === null || pendiente === valor);
  const procedencia: ProcedenciaPlata = sinEjecucionReportada ? "sin_rastro" : "reportado";

  if (pendiente !== null && pendiente > 0) {
    return { valor: pendiente, procedencia, enTramite };
  }
  if (valor !== null && pagado !== null) {
    const resto = valor - pagado;
    return { valor: resto > 0 ? resto : 0, procedencia, enTramite };
  }
  return nada;
}

/**
 * Cuenta señales independientes: familias normativas distintas entre los
 * hallazgos que no son meros agravantes.
 */
export function patronesIndependientes(findings: readonly Finding[]): number {
  const familias = new Set<string>();
  for (const f of findings) {
    const code = f.pattern_code as PatternCode;
    const familia = familiaOf(code);
    // Un código que el catálogo no conoce no aporta señal: se ignora.
    if (!familia) continue;
    if (esSoloAgravante(code)) continue;
    familias.add(familia);
  }
  return familias.size;
}

/** ¿Hay una inhabilidad activa confirmada? Siempre es P1 (METODOLOGIA §4). */
export function tieneInhabilidadActiva(findings: readonly Finding[]): boolean {
  return findings.some(
    (f) =>
      INHABILIDADES.includes(f.pattern_code as PatternCode) && f.confianza === "alta",
  );
}

/** Años transcurridos desde el hecho principal del contrato. */
function aniosDesdeHecho(c: ContractRow, today: string): number | null {
  const hecho = c.vigencia === "historico" ? (c.fecha_fin ?? c.fecha_firma) : c.fecha_firma;
  if (!hecho) return null;
  const a = Date.parse(`${hecho}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / 86_400_000 / DIAS_POR_ANIO;
}

/**
 * Razones del "por qué ahora" (METODOLOGIA §4), compuestas desde los datos.
 * Nunca las genera un LLM: son plantillas rellenadas con cifras verificables.
 */
function componerPorqueAhora(
  c: ContractRow,
  findings: readonly Finding[],
  plata: number | null,
  anios: number | null,
): string[] {
  const razones: string[] = [];

  if (c.vigencia === "vigente" && plata !== null && plata > 0) {
    const { procedencia, enTramite } = detallePlataEnRiesgo(c);
    if (procedencia === "corroborado") {
      const facturas = c.pagos_filas ?? 0;
      razones.push(
        `Quedan ${formatCOP(plata)} sin desembolsar, verificado contra el plan de pagos ` +
          `de SECOP (${facturas} ${facturas === 1 ? "factura" : "facturas"}): la ` +
          `intervención temprana puede evitar que salgan.`,
      );
      if (enTramite !== null && enTramite > 0) {
        razones.push(
          `${formatCOP(enTramite)} ya están facturados y aprobados o radicados, ` +
            `pendientes de desembolso.`,
        );
      }
    } else if (procedencia === "reportado") {
      razones.push(
        `Quedan ${formatCOP(plata)} sin desembolsar según lo reportado: la intervención ` +
          `temprana puede evitar que salgan.`,
      );
    } else {
      razones.push(
        `No consta ejecución de este contrato de ${formatCOP(plata)}: ni pagos reportados ` +
          `por la entidad ni facturas en el plan de pagos de SECOP. La cifra en riesgo es ` +
          `el valor total mientras no haya rastro.`,
      );
    }
  }

  if (c.vigencia === "historico" && plata !== null && plata > 0) {
    const { procedencia } = detallePlataEnRiesgo(c);
    razones.push(
      procedencia === "corroborado"
        ? `Ya se desembolsaron ${formatCOP(plata)} —verificado factura por factura en el ` +
          `plan de pagos de SECOP—, que es el techo del posible detrimento.`
        : `Ya se desembolsaron ${formatCOP(plata)}, que es el techo del posible detrimento.`,
    );
  }

  if (anios !== null && c.vigencia === "historico") {
    if (anios <= PRIORIDAD.p2VentanaFiscalAnios) {
      razones.push(
        `El hecho principal ocurrió hace ${anios.toFixed(1)} años: dentro de la ` +
          `ventana general de la acción fiscal.`,
      );
    } else {
      razones.push(
        `El hecho principal ocurrió hace ${anios.toFixed(1)} años: fuera de la ventana ` +
          `general de 5 años, verificar caducidad caso a caso.`,
      );
    }
  }

  const independientes = patronesIndependientes(findings);
  if (independientes >= PRIORIDAD.p1PatronesIndependientes) {
    const codigos = findings
      .filter((f) => !esSoloAgravante(f.pattern_code as PatternCode))
      .map((f) => f.pattern_code);
    razones.push(
      `Convergen ${independientes} señales de naturaleza distinta ` +
        `(${codigos.join(", ")}), no una sola repetida.`,
    );
  }

  if (tieneInhabilidadActiva(findings)) {
    razones.push(`Hay una inhabilidad activa confirmada: no admite espera.`);
  }

  const agravantes = findings.filter((f) => esSoloAgravante(f.pattern_code as PatternCode));
  if (agravantes.length) {
    razones.push(
      `Agravantes que no priorizan por sí solos: ` +
        `${agravantes.map((f) => f.pattern_code).join(", ")}.`,
    );
  }

  if (c.valor_verificar) {
    razones.push(
      `Valor reportado inverosímil según SECOP — verificar en la fuente antes de ` +
        `cuantificar.`,
    );
  }

  return razones;
}

/** Triaje completo de un contrato a partir de sus hallazgos. */
export function triar(
  c: ContractRow,
  findings: readonly Finding[],
  opts: { today: string; pisoMaterialidad?: number },
): Triaje {
  const piso = opts.pisoMaterialidad ?? PISO_MATERIALIDAD_COP;
  const risk_score = scoreOf(findings);
  const risk_level = levelOf(risk_score);
  const plata = plataEnRiesgo(c);

  // Los no computables quedan fuera del triaje (METODOLOGIA §6.9).
  if (!esComputable(c) && c.vigencia === "otro") {
    return { risk_score, risk_level, prioridad: null, plata_en_riesgo: null, porque_ahora: [] };
  }

  const anios = aniosDesdeHecho(c, opts.today);
  const independientes = patronesIndependientes(findings);
  const inhabilidad = tieneInhabilidadActiva(findings);

  let prioridad: Prioridad | null = null;

  if (inhabilidad) {
    // Una inhabilidad activa no admite triaje.
    prioridad = "P1";
  } else if (
    c.vigencia === "vigente" &&
    risk_score >= PRIORIDAD.p1ScoreMinimo &&
    independientes >= PRIORIDAD.p1PatronesIndependientes &&
    plata !== null &&
    plata >= piso
  ) {
    prioridad = "P1";
  } else if (
    c.vigencia === "historico" &&
    risk_level === "critico" &&
    anios !== null &&
    anios <= PRIORIDAD.p2VentanaFiscalAnios
  ) {
    prioridad = "P2";
  } else if (
    c.vigencia === "vigente" &&
    risk_score >= PRIORIDAD.p2ScoreMinimoVigente &&
    risk_score <= PRIORIDAD.p2ScoreMaximoVigente &&
    plata !== null &&
    plata >= piso
  ) {
    prioridad = "P2";
  } else if (risk_score >= PRIORIDAD.p3ScoreMinimo) {
    prioridad = "P3";
  }

  return {
    risk_score,
    risk_level,
    prioridad,
    plata_en_riesgo: plata,
    porque_ahora: prioridad ? componerPorqueAhora(c, findings, plata, anios) : [],
  };
}
