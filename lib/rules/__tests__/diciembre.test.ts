import { describe, expect, it } from "vitest";
import { diciembre } from "../diciembre";
import { contract, soloCtx } from "./fixtures";

function firmadoEl(fecha: string | null) {
  const c = contract({ fecha_firma: fecha });
  return diciembre.run(c, soloCtx(c));
}

describe("DICIEMBRE — dispara", () => {
  it("con una firma a mitad de diciembre", () => {
    expect(firmadoEl("2024-12-15")).not.toBeNull();
  });

  it("el primer día de diciembre", () => {
    expect(firmadoEl("2024-12-01")).not.toBeNull();
  });

  it("el último día del año", () => {
    expect(firmadoEl("2024-12-31")).not.toBeNull();
  });

  it("con 10 puntos y severidad media", () => {
    const f = firmadoEl("2024-12-20")!;
    expect(f.points).toBe(10);
    expect(f.severity).toBe("media");
    expect(f.pattern_code).toBe("DICIEMBRE");
  });

  it("con evidence que registra la fecha y el valor", () => {
    const c = contract({ fecha_firma: "2024-12-20", valor_contrato: 55_000_000 });
    const f = diciembre.run(c, soloCtx(c))!;
    expect(f.evidence).toMatchObject({
      fecha_firma: "2024-12-20",
      mes: 12,
      valor_contrato: 55_000_000,
    });
  });

  it("con un detail que explica el porqué sin acusar", () => {
    const { detail } = firmadoEl("2024-12-20")!;
    expect(detail).toContain("diciembre");
    expect(detail).toContain("2024-12-20");
    expect(detail).not.toMatch(/corrupci|delito|fraude|culpab/i);
  });
});

describe("DICIEMBRE — no dispara", () => {
  it.each(["2024-11-30", "2025-01-01", "2025-06-15", "2024-02-29"])(
    "con firma el %s",
    (fecha) => {
      expect(firmadoEl(fecha)).toBeNull();
    },
  );

  it("sin fecha de firma", () => {
    expect(firmadoEl(null)).toBeNull();
  });

  it("con una fecha con formato inesperado", () => {
    expect(firmadoEl("diciembre de 2024")).toBeNull();
  });

  it("no confunde el día 12 con el mes 12", () => {
    expect(firmadoEl("2024-06-12")).toBeNull();
  });
});
