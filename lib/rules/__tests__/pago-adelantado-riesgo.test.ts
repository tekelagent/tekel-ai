import { describe, expect, it } from "vitest";
import { pagoAdelantadoRiesgo } from "../pago-adelantado-riesgo";
import { contract, soloCtx } from "./fixtures";

describe("PAGO_ADELANTADO_RIESGO — dispara", () => {
  it("cuando el anticipo está habilitado", () => {
    const c = contract({ pago_adelantado: true });
    expect(pagoAdelantadoRiesgo.run(c, soloCtx(c))).not.toBeNull();
  });

  it("con 10 puntos y severidad media", () => {
    const c = contract({ pago_adelantado: true });
    const f = pagoAdelantadoRiesgo.run(c, soloCtx(c))!;
    expect(f.points).toBe(10);
    expect(f.severity).toBe("media");
  });

  it("calculando el porcentaje que representa el anticipo", () => {
    const c = contract({
      pago_adelantado: true,
      valor_pago_adelantado: 30_000_000,
      valor_contrato: 100_000_000,
    });
    const f = pagoAdelantadoRiesgo.run(c, soloCtx(c))!;
    expect(f.evidence).toMatchObject({
      pago_adelantado: true,
      valor_pago_adelantado: 30_000_000,
      valor_contrato: 100_000_000,
      pct_anticipo: 0.3,
    });
    expect(f.detail).toContain("30.0%");
  });

  it("aunque no se conozca el monto del anticipo", () => {
    const c = contract({ pago_adelantado: true, valor_pago_adelantado: null });
    const f = pagoAdelantadoRiesgo.run(c, soloCtx(c))!;
    expect(f.evidence.valor_pago_adelantado).toBeNull();
    expect(f.evidence.pct_anticipo).toBeNull();
    expect(f.detail).toContain("no registra el monto");
  });

  it("aunque no se conozca el valor del contrato", () => {
    const c = contract({
      pago_adelantado: true,
      valor_pago_adelantado: 5_000_000,
      valor_contrato: null,
    });
    const f = pagoAdelantadoRiesgo.run(c, soloCtx(c))!;
    expect(f.evidence.pct_anticipo).toBeNull();
  });

  it("dejando registrado por qué no se aplicaron los 30 puntos de CLAUDE.md", () => {
    // El ascenso a 30 depende de PROVEEDOR_RECIENTE, que es un hallazgo de Croma.
    const c = contract({ pago_adelantado: true });
    const f = pagoAdelantadoRiesgo.run(c, soloCtx(c))!;
    expect(f.evidence.ascenso_a_30_pendiente_de).toContain("PROVEEDOR_RECIENTE");
  });

  it("con un detail que aclara que el anticipo es legal", () => {
    const c = contract({ pago_adelantado: true });
    const { detail } = pagoAdelantadoRiesgo.run(c, soloCtx(c))!;
    expect(detail).toContain("legal");
    expect(detail).not.toMatch(/corrupci|delito|fraude|culpab/i);
  });
});

describe("PAGO_ADELANTADO_RIESGO — no dispara", () => {
  it("cuando el anticipo está explícitamente deshabilitado", () => {
    const c = contract({ pago_adelantado: false });
    expect(pagoAdelantadoRiesgo.run(c, soloCtx(c))).toBeNull();
  });

  it("cuando se desconoce, porque un desconocido no es un sí", () => {
    // El dataset trae "No Definido" en muchas filas, que el mapeo vuelve null.
    const c = contract({ pago_adelantado: null });
    expect(pagoAdelantadoRiesgo.run(c, soloCtx(c))).toBeNull();
  });

  it("aunque haya un monto de anticipo si la bandera no es true", () => {
    const c = contract({ pago_adelantado: null, valor_pago_adelantado: 9_000_000 });
    expect(pagoAdelantadoRiesgo.run(c, soloCtx(c))).toBeNull();
  });
});
