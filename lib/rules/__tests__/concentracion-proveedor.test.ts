import { describe, expect, it } from "vitest";
import { concentracionProveedor } from "../concentracion-proveedor";
import { contract, ctxOf } from "./fixtures";
import type { ContractRow } from "../types";

/** n contratos de la misma entidad con el mismo proveedor. */
function nContratos(n: number, overrides: Partial<ContractRow> = {}): ContractRow[] {
  return Array.from({ length: n }, (_, i) =>
    contract({
      fecha_firma: `2025-${String((i % 12) + 1).padStart(2, "0")}-15`,
      valor_contrato: 1_000_000,
      ...overrides,
    }),
  );
}

describe("CONCENTRACION_PROVEEDOR — dispara", () => {
  it("con 10 contratos, el mínimo exacto", () => {
    const cs = nContratos(10);
    expect(concentracionProveedor.run(cs[0], ctxOf(cs))).not.toBeNull();
  });

  it("con más de 10", () => {
    const cs = nContratos(25);
    const f = concentracionProveedor.run(cs[0], ctxOf(cs))!;
    expect(f.evidence.total_contratos).toBe(25);
  });

  it("con 20 puntos y severidad alta", () => {
    const cs = nContratos(10);
    const f = concentracionProveedor.run(cs[0], ctxOf(cs))!;
    expect(f.points).toBe(20);
    expect(f.severity).toBe("alta");
    expect(f.pattern_code).toBe("CONCENTRACION_PROVEEDOR");
  });

  it("acumulando el valor total de la relación", () => {
    const cs = nContratos(10);
    const f = concentracionProveedor.run(cs[0], ctxOf(cs))!;
    expect(f.evidence).toMatchObject({
      total_contratos: 10,
      umbral_contratos: 10,
      valor_total: 10_000_000,
      nit_entidad: "800000000",
      documento_proveedor: "111111111",
    });
  });

  it("registrando el periodo de la relación", () => {
    const cs = nContratos(10);
    const f = concentracionProveedor.run(cs[0], ctxOf(cs))!;
    expect(f.evidence.primera_firma).toBe("2025-01-15");
    expect(f.evidence.ultima_firma).toBe("2025-10-15");
  });

  it("con un detail que aclara que la concentración no es irregularidad por sí sola", () => {
    const cs = nContratos(10);
    const { detail } = concentracionProveedor.run(cs[0], ctxOf(cs))!;
    expect(detail).toContain("10 contratos");
    expect(detail).toMatch(/legítima|legitima/);
    expect(detail).not.toMatch(/corrupci|delito|fraude|culpab/i);
  });

  it("sin importar la cuantía: no hay techo de valor, a diferencia de FRACCIONAMIENTO", () => {
    const cs = nContratos(10, { valor_contrato: 900_000_000 });
    expect(concentracionProveedor.run(cs[0], ctxOf(cs))).not.toBeNull();
  });

  it("sin importar cuán separados estén en el tiempo", () => {
    const cs = nContratos(10);
    cs[0].fecha_firma = "2015-01-01";
    expect(concentracionProveedor.run(cs[0], ctxOf(cs))).not.toBeNull();
  });
});

describe("CONCENTRACION_PROVEEDOR — no dispara", () => {
  it("con 9 contratos, justo debajo del mínimo", () => {
    const cs = nContratos(9);
    expect(concentracionProveedor.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("con un solo contrato", () => {
    const cs = nContratos(1);
    expect(concentracionProveedor.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("cuando los 10 contratos son de proveedores distintos", () => {
    const cs = nContratos(10).map((c, i) => ({ ...c, documento_proveedor: `prov-${i}` }));
    expect(concentracionProveedor.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("cuando los 10 contratos son de entidades distintas", () => {
    const cs = nContratos(10).map((c, i) => ({ ...c, nit_entidad: `nit-${i}` }));
    expect(concentracionProveedor.run(cs[0], ctxOf(cs))).toBeNull();
  });
});

describe("CONCENTRACION_PROVEEDOR — bordes de datos ausentes", () => {
  it("sin NIT de entidad", () => {
    const cs = nContratos(10).map((c) => ({ ...c, nit_entidad: null }));
    expect(concentracionProveedor.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("sin documento de proveedor", () => {
    const cs = nContratos(10).map((c) => ({ ...c, documento_proveedor: null }));
    expect(concentracionProveedor.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("tolera valores nulos al sumar el total", () => {
    const cs = nContratos(10);
    cs[0].valor_contrato = null;
    const f = concentracionProveedor.run(cs[1], ctxOf(cs))!;
    expect(f.evidence.valor_total).toBe(9_000_000);
  });

  it("tolera contratos sin fecha de firma al calcular el periodo", () => {
    const cs = nContratos(10);
    cs.forEach((c) => (c.fecha_firma = null));
    const f = concentracionProveedor.run(cs[0], ctxOf(cs))!;
    expect(f.evidence.primera_firma).toBeNull();
    expect(f.evidence.ultima_firma).toBeNull();
  });
});
