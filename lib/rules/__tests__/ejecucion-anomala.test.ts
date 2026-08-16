import { describe, expect, it } from "vitest";
import { ejecucionAnomala } from "../ejecucion-anomala";
import { contract, soloCtx } from "./fixtures";
import type { ContractRow } from "../types";

const HOY = "2026-08-15";
const historico = (over: Partial<ContractRow> = {}) =>
  contract({
    vigencia: "historico",
    estado_contrato: "Terminado",
    fecha_fin: "2025-01-15",
    valor_contrato: 500_000_000,
    valor_pendiente_ejecucion: 0,
    raw: { "liquidaci_n": "Si" },
    ...over,
  });
const run = (c: ContractRow) => ejecucionAnomala.run(c, soloCtx(c, HOY));

describe("EJECUCION_ANOMALA — condición (c): estado anormal", () => {
  it.each(["Terminado anormalmente", "Cedido", "cedido parcialmente"])(
    "dispara con estado %s",
    (estado) => {
      const f = run(historico({ estado_contrato: estado }));
      expect(f).not.toBeNull();
      expect(f!.evidence.condicion).toBe("c");
      expect(f!.confianza).toBe("alta");
    },
  );

  it("tiene prelación sobre las otras condiciones", () => {
    const f = run(
      historico({ estado_contrato: "Cedido", valor_pendiente_ejecucion: 400_000_000 }),
    )!;
    expect(f.evidence.condicion).toBe("c");
  });
});

describe("EJECUCION_ANOMALA — condición (b): pendiente de ejecución", () => {
  it("dispara con más del 20% pendiente estando terminado", () => {
    const f = run(historico({ valor_pendiente_ejecucion: 150_000_000 }));
    expect(f).not.toBeNull();
    expect(f!.evidence.condicion).toBe("b");
    expect(f!.evidence.fraccion_pendiente).toBe(0.3);
    expect(f!.confianza).toBe("media");
  });

  it("no dispara con exactamente el 20%, porque el umbral es estricto", () => {
    expect(run(historico({ valor_pendiente_ejecucion: 100_000_000 }))).toBeNull();
  });

  it("no dispara sin pendiente", () => {
    expect(run(historico({ valor_pendiente_ejecucion: 0 }))).toBeNull();
  });
});

describe("EJECUCION_ANOMALA — condición (a): terminado sin liquidar", () => {
  /** La condición (a) solo aplica donde la liquidación es exigible. */
  const deObra = (over: Partial<ContractRow> = {}) =>
    historico({ tipo_de_contrato: "Obra", ...over });

  it("dispara si terminó hace más de 6 meses y sigue sin liquidar", () => {
    const f = run(deObra({ raw: { "liquidaci_n": "No" }, fecha_fin: "2025-01-15" }));
    expect(f).not.toBeNull();
    expect(f!.evidence.condicion).toBe("a");
    expect(f!.evidence.liquidado).toBe(false);
    expect(f!.confianza).toBe("alta");
  });

  it("no dispara si ya está liquidado", () => {
    expect(run(deObra({ raw: { "liquidaci_n": "Si" } }))).toBeNull();
  });

  it("no dispara si terminó hace menos de 6 meses", () => {
    expect(run(deObra({ raw: { "liquidaci_n": "No" }, fecha_fin: "2026-07-01" }))).toBeNull();
  });

  it("se abstiene si el campo de liquidación no es interpretable", () => {
    expect(
      run(deObra({ raw: { "liquidaci_n": "No Definido" }, fecha_fin: "2024-01-01" })),
    ).toBeNull();
  });

  it("se abstiene si no hay fila cruda", () => {
    expect(run(deObra({ raw: null, fecha_fin: "2024-01-01" }))).toBeNull();
  });
});

describe("EJECUCION_ANOMALA v2 — la liquidación no es exigible en todo contrato", () => {
  it.each(["Obra", "Suministro", "Interventoría", "Consultoría", "Concesión"])(
    "en %s la condición (a) sí aplica",
    (tipo) => {
      const f = run(
        historico({ tipo_de_contrato: tipo, raw: { "liquidaci_n": "No" }, fecha_fin: "2025-01-15" }),
      );
      expect(f).not.toBeNull();
      expect(f!.evidence.condicion).toBe("a");
    },
  );

  it("en prestación de servicios se abstiene en vez de señalar un incumplimiento inexistente", () => {
    const c = historico({
      tipo_de_contrato: "Prestación de servicios",
      raw: { "liquidaci_n": "No" },
      fecha_fin: "2025-01-15",
    });
    expect(run(c)).toBeNull();
  });

  it("pero las condiciones (b) y (c) siguen aplicando en cualquier tipo", () => {
    const b = run(
      historico({ tipo_de_contrato: "Prestación de servicios", valor_pendiente_ejecucion: 150_000_000 }),
    );
    expect(b!.evidence.condicion).toBe("b");
    const cc = run(
      historico({ tipo_de_contrato: "Prestación de servicios", estado_contrato: "Cedido" }),
    );
    expect(cc!.evidence.condicion).toBe("c");
  });
});

describe("EJECUCION_ANOMALA — alcance y bordes", () => {
  it("no aplica a contratos vigentes: es un patrón de auditoría histórica", () => {
    const c = historico({ vigencia: "vigente", estado_contrato: "Cedido" });
    expect(run(c)).toBeNull();
  });

  it("no aplica a contratos que nunca se ejecutaron", () => {
    expect(run(historico({ vigencia: "otro", estado_contrato: "Cedido" }))).toBeNull();
  });

  it("no aplica a contratos con valor inverosímil", () => {
    expect(run(historico({ valor_verificar: true, estado_contrato: "Cedido" }))).toBeNull();
  });

  it("pesa 25 puntos con foco entidad y cita la norma del catálogo", () => {
    const f = run(historico({ estado_contrato: "Cedido" }))!;
    expect(f.points).toBe(25);
    expect(f.foco).toBe("entidad");
    expect(f.detail).toContain("Ley 80 art. 60; Ley 1150 art. 11");
    expect(f.detail).not.toMatch(/corrupci|delito|fraude|culpab/i);
  });

  it("tolera valor_contrato nulo en la condición (b)", () => {
    const c = historico({ valor_contrato: null, valor_pendiente_ejecucion: 999 });
    expect(run(c)).toBeNull();
  });
});
