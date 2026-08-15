/**
 * Constructor de hallazgos.
 *
 * Centraliza los campos que ninguna regla debe poder olvidar ni contradecir:
 * los puntos y la severidad salen del catálogo de patrones, y el foco del
 * catálogo normativo. Una regla solo aporta lo que sabe: su confianza, su
 * explicación y sus cifras.
 */
import { focoOf, pointsOf, severityOf, type PatternCode } from "./catalog";
import type { Confianza, ContractRow, Finding, FindingSource } from "./types";

export function makeFinding(args: {
  contract: ContractRow;
  code: PatternCode;
  confianza: Confianza;
  detail: string;
  evidence: Record<string, unknown>;
  /** Solo para patrones cuyo peso varía, como PAGO_ADELANTADO_RIESGO. */
  points?: number;
  source?: FindingSource;
}): Finding {
  const { contract, code, confianza, detail, evidence } = args;
  return {
    contract_id: contract.id,
    pattern_code: code,
    severity: severityOf(code),
    points: args.points ?? pointsOf(code),
    confianza,
    foco: focoOf(code),
    detail,
    evidence,
    source: args.source ?? "rules",
  };
}
