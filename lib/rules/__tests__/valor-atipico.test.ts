import { describe, expect, it } from "vitest";
import { valorAtipico } from "../valor-atipico";
import { contract, ctxOf } from "./fixtures";
import type { ContractRow } from "../types";

/** n comparables del mismo tipo y departamento, todos por el mismo valor. */
function comparables(n: number, valor = 10_000_000): ContractRow[] {
  return Array.from({ length: n }, () => contract({ valor_contrato: valor }));
}

describe("VALOR_ATIPICO — dispara", () => {
  it("con 30+ comparables, sobre el percentil 95 y más de 2x la mediana", () => {
    const caro = contract({ valor_contrato: 100_000_000 });
    const corpus = [...comparables(40), caro];
    const f = valorAtipico.run(caro, ctxOf(corpus));
    expect(f).not.toBeNull();
    expect(f!.points).toBe(25);
    expect(f!.foco).toBe("ambos");
  });

  it("con evidence que trae mediana, N y ratio (METODOLOGIA §3)", () => {
    const caro = contract({ valor_contrato: 100_000_000 });
    const corpus = [...comparables(40), caro];
    const f = valorAtipico.run(caro, ctxOf(corpus))!;
    expect(f.evidence).toMatchObject({
      valor_contrato: 100_000_000,
      comparables_n: 41,
      comparables_minimo_exigido: 30,
      mediana_grupo: 10_000_000,
      ratio_sobre_mediana: 10,
      ratio_minimo_exigido: 2,
    });
  });

  it("con confianza media si el grupo es pequeño y alta si es grande", () => {
    const caro1 = contract({ valor_contrato: 100_000_000 });
    const chico = valorAtipico.run(caro1, ctxOf([...comparables(40), caro1]))!;
    expect(chico.confianza).toBe("media");

    const caro2 = contract({ valor_contrato: 100_000_000 });
    const grande = valorAtipico.run(caro2, ctxOf([...comparables(150), caro2]))!;
    expect(grande.confianza).toBe("alta");
  });

  it("citando la norma desde el catálogo", () => {
    const caro = contract({ valor_contrato: 100_000_000 });
    const { detail } = valorAtipico.run(caro, ctxOf([...comparables(40), caro]))!;
    expect(detail).toContain("Ley 80 de 1993, arts. 25-26");
    expect(detail).not.toMatch(/corrupci|delito|fraude|culpab/i);
  });
});

describe("VALOR_ATIPICO — se abstiene", () => {
  it("con menos de 30 comparables, en vez de bajar el listón", () => {
    const caro = contract({ valor_contrato: 100_000_000 });
    const corpus = [...comparables(28), caro];
    expect(valorAtipico.run(caro, ctxOf(corpus))).toBeNull();
  });

  it("cuando supera el percentil pero no llega a 2x la mediana", () => {
    // METODOLOGIA exige AMBAS condiciones.
    const caro = contract({ valor_contrato: 15_000_000 });
    const corpus = [...comparables(40), caro];
    expect(valorAtipico.run(caro, ctxOf(corpus))).toBeNull();
  });

  it("sobre un contrato de valor mediano dentro de su grupo", () => {
    const corpus = comparables(40);
    expect(valorAtipico.run(corpus[0], ctxOf(corpus))).toBeNull();
  });

  it("sin tipo_de_contrato, que es media clave del grupo", () => {
    const caro = contract({ valor_contrato: 100_000_000, tipo_de_contrato: null });
    expect(valorAtipico.run(caro, ctxOf([...comparables(40), caro]))).toBeNull();
  });

  it("sin departamento", () => {
    const caro = contract({ valor_contrato: 100_000_000, departamento: null });
    expect(valorAtipico.run(caro, ctxOf([...comparables(40), caro]))).toBeNull();
  });

  it.each([
    ["valor nulo", null],
    ["valor cero", 0],
    ["valor negativo", -5],
  ])("con %s", (_t, valor) => {
    const c = contract({ valor_contrato: valor as number | null });
    expect(valorAtipico.run(c, ctxOf([...comparables(40), c]))).toBeNull();
  });
});

describe("VALOR_ATIPICO — el pool de comparables se protege (METODOLOGIA §6.8)", () => {
  it("excluye del grupo los valores inverosímiles", () => {
    // Sin la exclusión, este monstruo movería el percentil 95 del grupo y
    // haría que el contrato caro pareciera normal.
    const monstruo = contract({ valor_contrato: 9e15, valor_verificar: true });
    const caro = contract({ valor_contrato: 100_000_000 });
    const corpus = [...comparables(40), monstruo, caro];
    const f = valorAtipico.run(caro, ctxOf(corpus));
    expect(f).not.toBeNull();
    expect(f!.evidence.comparables_n).toBe(41);
  });

  it("excluye del grupo los contratos que nunca se ejecutaron", () => {
    const borradores = comparables(20).map((c) => ({ ...c, vigencia: "otro" as const }));
    const caro = contract({ valor_contrato: 100_000_000 });
    const corpus = [...comparables(15), ...borradores, caro];
    // 15 + 1 computables = 16 < 30 -> se abstiene
    expect(valorAtipico.run(caro, ctxOf(corpus))).toBeNull();
  });
});
