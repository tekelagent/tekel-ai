import { describe, expect, it } from "vitest";
import { concentracionProveedor } from "../concentracion-proveedor";
import { contract, ctxOf } from "./fixtures";
import type { ContractRow } from "../types";

const HOY = "2026-08-15";

/** n contratos de la misma entidad con el mismo proveedor, dentro de la ventana. */
function nContratos(n: number, over: Partial<ContractRow> = {}): ContractRow[] {
  return Array.from({ length: n }, (_, i) =>
    contract({
      fecha_firma: `2026-${String((i % 8) + 1).padStart(2, "0")}-15`,
      valor_contrato: 1_000_000,
      ...over,
    }),
  );
}
const run = (c: ContractRow, cs: ContractRow[]) =>
  concentracionProveedor.run(c, ctxOf(cs, HOY));

/**
 * Otros proveedores de la misma entidad. Sin ellos el proveedor bajo prueba
 * concentraría el 100% del valor y la condición (b) dispararía siempre,
 * enmascarando lo que cada test quiere aislar.
 */
const otrosProveedores = () =>
  nContratos(10, { documento_proveedor: "999", valor_contrato: 100_000_000 });

describe("CONCENTRACION_PROVEEDOR — condición (a): conteo", () => {
  it("dispara con 8 contratos, el mínimo de METODOLOGIA", () => {
    // Con otros proveedores presentes la fracción queda marginal, así que este
    // caso aísla la condición de conteo.
    const ocho = nContratos(8);
    const cs = [...ocho, ...otrosProveedores()];
    const f = run(ocho[0], cs);
    expect(f).not.toBeNull();
    expect(f!.evidence.condicion).toBe("conteo");
  });

  it("no dispara con 7 si tampoco alcanza la fracción", () => {
    // Otro proveedor aporta el grueso del valor de la entidad.
    const otros = nContratos(3, { documento_proveedor: "999", valor_contrato: 500_000_000 });
    const cs = [...nContratos(7), ...otros];
    expect(run(cs[0], cs)).toBeNull();
  });

  it("el conteo da confianza alta: en la muestra ya hay 8, en la realidad hay ≥8", () => {
    const cs = nContratos(8);
    expect(run(cs[0], cs)!.confianza).toBe("alta");
  });

  it("con 20 puntos, severidad alta y foco ambos", () => {
    const cs = nContratos(8);
    const f = run(cs[0], cs)!;
    expect(f.points).toBe(20);
    expect(f.severity).toBe("alta");
    expect(f.foco).toBe("ambos");
  });
});

describe("CONCENTRACION_PROVEEDOR — condición (b): fracción del valor de la entidad", () => {
  it("dispara con pocos contratos pero >=30% del valor contratado por la entidad", () => {
    const dominante = nContratos(2, { valor_contrato: 400_000_000 });
    const resto = nContratos(5, { documento_proveedor: "999", valor_contrato: 100_000_000 });
    const cs = [...dominante, ...resto];
    const f = run(dominante[0], cs);
    expect(f).not.toBeNull();
    expect(f!.evidence.condicion).toBe("fraccion");
  });

  it("la fracción da confianza baja: el corpus es una muestra, no el universo", () => {
    const dominante = nContratos(2, { valor_contrato: 400_000_000 });
    const resto = nContratos(5, { documento_proveedor: "999", valor_contrato: 100_000_000 });
    const cs = [...dominante, ...resto];
    const f = run(dominante[0], cs)!;
    expect(f.confianza).toBe("baja");
    expect(f.evidence.corpus_parcial).toBe(true);
    expect(f.detail).toContain("muestra");
  });

  it("marca 'ambas' cuando se cumplen las dos condiciones", () => {
    const cs = nContratos(10, { valor_contrato: 100_000_000 });
    const f = run(cs[0], cs)!;
    expect(f.evidence.condicion).toBe("ambas");
    // Con ambas, manda la confianza alta del conteo.
    expect(f.confianza).toBe("alta");
  });
});

describe("CONCENTRACION_PROVEEDOR — alcance", () => {
  it("no tiene techo de cuantía, a diferencia de FRACCIONAMIENTO", () => {
    const cs = nContratos(8, { valor_contrato: 900_000_000 });
    expect(run(cs[0], cs)).not.toBeNull();
  });

  it("acumula el valor total de la relación en evidence", () => {
    const cs = nContratos(8);
    const f = run(cs[0], cs)!;
    expect(f.evidence).toMatchObject({
      total_contratos: 8,
      umbral_contratos: 8,
      valor_total: 8_000_000,
      nit_entidad: "800000000",
      documento_proveedor: "111111111",
    });
  });

  it("aclara que la concentración no es irregularidad por sí sola", () => {
    const cs = nContratos(8);
    const { detail } = run(cs[0], cs)!;
    expect(detail).toMatch(/legítima|legitima/);
    expect(detail).toContain("Ley 80 de 1993, art. 24");
    expect(detail).not.toMatch(/corrupci|delito|fraude|culpab/i);
  });
});

describe("CONCENTRACION_PROVEEDOR — no dispara y bordes", () => {
  it("con un solo contrato entre muchos de otros proveedores", () => {
    const uno = nContratos(1);
    const cs = [...uno, ...otrosProveedores()];
    expect(run(uno[0], cs)).toBeNull();
  });

  it("cuando los contratos son de proveedores distintos", () => {
    const cs = nContratos(8).map((c, i) => ({ ...c, documento_proveedor: `prov-${i}` }));
    expect(run(cs[0], cs)).toBeNull();
  });

  it("cuando son de entidades distintas", () => {
    // Cada entidad aporta además otro proveedor, para que la fracción no
    // dispare por ser el único.
    const cs = nContratos(8).flatMap((c, i) => [
      { ...c, nit_entidad: `nit-${i}` },
      contract({
        nit_entidad: `nit-${i}`,
        documento_proveedor: "999",
        valor_contrato: 100_000_000,
        fecha_firma: "2026-05-15",
      }),
    ]);
    expect(run(cs[0], cs)).toBeNull();
  });

  it.each([
    ["sin NIT de entidad", "nit_entidad"],
    ["sin documento de proveedor", "documento_proveedor"],
  ] as const)("se abstiene %s", (_t, campo) => {
    const cs = nContratos(8).map((c) => ({ ...c, [campo]: null }));
    expect(run(cs[0], cs)).toBeNull();
  });

  it("tolera valores nulos al sumar el total", () => {
    const cs = nContratos(8);
    cs[0].valor_contrato = null;
    expect(run(cs[1], cs)!.evidence.valor_total).toBe(7_000_000);
  });

  it("ignora los contratos que nunca se ejecutaron al contar", () => {
    const cs = [...nContratos(8), ...otrosProveedores()];
    cs[0].vigencia = "otro";
    // Quedan 7 computables: por debajo del mínimo, y la fracción es marginal.
    expect(run(cs[1], cs)).toBeNull();
  });
});
