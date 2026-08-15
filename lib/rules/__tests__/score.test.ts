import { describe, expect, it } from "vitest";
import { levelOf, scoreContract, scoreOf } from "../score";
import type { Finding } from "../types";

function finding(points: number): Finding {
  return {
    contract_id: "c1",
    pattern_code: "PRUEBA",
    severity: "media",
    points,
    detail: "",
    evidence: {},
    source: "rules",
  };
}

describe("scoreOf", () => {
  it("sin hallazgos da 0", () => {
    expect(scoreOf([])).toBe(0);
  });

  it("suma los puntos de los hallazgos", () => {
    expect(scoreOf([finding(25), finding(10), finding(20)])).toBe(55);
  });

  it("topa en 100 aunque la suma se pase", () => {
    expect(scoreOf([finding(45), finding(40), finding(30), finding(25)])).toBe(100);
  });

  it("da exactamente 100 cuando la suma es 100", () => {
    expect(scoreOf([finding(40), finding(30), finding(30)])).toBe(100);
  });

  it("nunca devuelve negativo", () => {
    expect(scoreOf([finding(-50)])).toBe(0);
  });
});

describe("levelOf — cortes de CLAUDE.md (0-29 bajo, 30-64 medio, 65+ critico)", () => {
  it.each([
    [0, "bajo"],
    [29, "bajo"],
    [30, "medio"],
    [64, "medio"],
    [65, "critico"],
    [100, "critico"],
  ] as const)("score %i -> %s", (score, nivel) => {
    expect(levelOf(score)).toBe(nivel);
  });
});

describe("scoreContract", () => {
  it("devuelve score y nivel coherentes entre sí", () => {
    // 25 + 10 = 35 -> medio
    expect(scoreContract([finding(25), finding(10)])).toEqual({
      risk_score: 35,
      risk_level: "medio",
    });
  });

  it("un contrato sin hallazgos es de riesgo bajo, no indefinido", () => {
    expect(scoreContract([])).toEqual({ risk_score: 0, risk_level: "bajo" });
  });

  it("el tope de 100 no cambia el nivel critico", () => {
    expect(scoreContract([finding(45), finding(40), finding(40)])).toEqual({
      risk_score: 100,
      risk_level: "critico",
    });
  });
});
