/**
 * Motor de scoring — CLAUDE.md.
 *
 *   risk_score = min(100, Σ points)
 *   0-29 bajo · 30-64 medio · 65+ crítico
 *
 * La ponderación es fija y vive en el catálogo: aquí solo se suma y se corta.
 * Ninguna heurística, ningún ajuste dinámico. Un contrato con los mismos
 * hallazgos siempre saca el mismo score, y cualquiera puede recalcularlo a mano.
 */
import { RISK_LEVELS } from "./thresholds";
import type { Finding } from "./types";

export type RiskLevel = "bajo" | "medio" | "critico";

/** Suma de puntos con tope en 100. */
export function scoreOf(findings: readonly Finding[]): number {
  const suma = findings.reduce((acc, f) => acc + f.points, 0);
  return Math.min(RISK_LEVELS.scoreMaximo, Math.max(0, suma));
}

/** Nivel a partir del score, con los cortes de CLAUDE.md. */
export function levelOf(score: number): RiskLevel {
  if (score >= RISK_LEVELS.criticoDesde) return "critico";
  if (score >= RISK_LEVELS.medioDesde) return "medio";
  return "bajo";
}

/** Score y nivel de un contrato a partir de sus hallazgos. */
export function scoreContract(findings: readonly Finding[]): {
  risk_score: number;
  risk_level: RiskLevel;
} {
  const risk_score = scoreOf(findings);
  return { risk_score, risk_level: levelOf(risk_score) };
}
