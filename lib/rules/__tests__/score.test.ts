import { describe, expect, it } from "vitest";
import { levelOf, scoreContract, scoreOf } from "../score";
import { finding } from "./fixtures";

const pts = (points: number) => finding({ points });

describe("scoreOf", () => {
  it("sin hallazgos da 0", () => {
    expect(scoreOf([])).toBe(0);
  });

  it("suma los puntos de los hallazgos", () => {
    expect(scoreOf([pts(25), pts(10), pts(20)])).toBe(55);
  });

  it("topa en 100 aunque la suma se pase", () => {
    expect(scoreOf([pts(45), pts(40), pts(30), pts(25)])).toBe(100);
  });

  it("da exactamente 100 cuando la suma es 100", () => {
    expect(scoreOf([pts(40), pts(30), pts(30)])).toBe(100);
  });

  it("nunca devuelve negativo", () => {
    expect(scoreOf([pts(-50)])).toBe(0);
  });
});

describe("levelOf — cortes de METODOLOGIA §4 (0-29 bajo, 30-64 medio, 65+ critico)", () => {
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
    expect(scoreContract([pts(25), pts(10)])).toEqual({
      risk_score: 35,
      risk_level: "medio",
    });
  });

  it("un contrato sin hallazgos es de riesgo bajo, no indefinido", () => {
    expect(scoreContract([])).toEqual({ risk_score: 0, risk_level: "bajo" });
  });

  it("el tope de 100 no cambia el nivel critico", () => {
    expect(scoreContract([pts(45), pts(40), pts(40)])).toEqual({
      risk_score: 100,
      risk_level: "critico",
    });
  });
});
