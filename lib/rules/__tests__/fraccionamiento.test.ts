import { describe, expect, it } from "vitest";
import { fraccionamiento } from "../fraccionamiento";
import { contract, ctxOf } from "./fixtures";
import type { ContractRow } from "../types";

/**
 * Todos los contratos comparten entidad, proveedor y objeto por defecto, que es
 * justo lo que la regla busca. Cada caso varía fechas, cuantías u objeto.
 */
function grupo(specs: Array<Partial<ContractRow>>): ContractRow[] {
  return specs.map((s) => contract(s));
}

/** Cuatro contratos pequeños del mismo objeto en 85 días: el caso canónico. */
function grupoQueDispara() {
  return grupo([
    { fecha_firma: "2025-01-10" },
    { fecha_firma: "2025-02-10" },
    { fecha_firma: "2025-03-10" },
    { fecha_firma: "2025-04-05" },
  ]);
}

describe("FRACCIONAMIENTO — dispara", () => {
  it("con 4 contratos pequeños del mismo objeto dentro de 90 días", () => {
    const cs = grupoQueDispara();
    const ctx = ctxOf(cs);
    const f = fraccionamiento.run(cs[0], ctx);
    expect(f).not.toBeNull();
    expect(f!.evidence.contratos_en_ventana).toBe(4);
  });

  it("para todos los contratos de la ventana, no solo el primero", () => {
    const cs = grupoQueDispara();
    const ctx = ctxOf(cs);
    for (const c of cs) {
      expect(fraccionamiento.run(c, ctx)).not.toBeNull();
    }
  });

  it("con 30 puntos y severidad alta", () => {
    const cs = grupoQueDispara();
    const f = fraccionamiento.run(cs[0], ctxOf(cs))!;
    expect(f.points).toBe(30);
    expect(f.severity).toBe("alta");
    expect(f.pattern_code).toBe("FRACCIONAMIENTO");
  });

  it("sumando el valor total de la ventana en la evidence", () => {
    const cs = grupoQueDispara();
    const f = fraccionamiento.run(cs[0], ctxOf(cs))!;
    expect(f.evidence).toMatchObject({
      contratos_en_ventana: 4,
      umbral_contratos: 4,
      ventana_dias: 90,
      dias_reales_entre_extremos: 85,
      valor_total_ventana: 40_000_000,
      fecha_desde: "2025-01-10",
      fecha_hasta: "2025-04-05",
    });
  });

  it("listando cada contrato con su fecha y su valor, verificable uno a uno", () => {
    const cs = grupoQueDispara();
    const f = fraccionamiento.run(cs[0], ctxOf(cs))!;
    const contratos = f.evidence.contratos as Array<Record<string, unknown>>;
    expect(contratos).toHaveLength(4);
    expect(contratos[0]).toHaveProperty("id_contrato");
    expect(contratos[0]).toHaveProperty("fecha_firma");
    expect(contratos[0]).toHaveProperty("valor_contrato");
  });

  it("ignorando tildes, mayúsculas y puntuación al comparar el objeto", () => {
    const cs = grupo([
      { fecha_firma: "2025-01-10", objeto: "PRESTACIÓN DE SERVICIOS DE APOYO" },
      { fecha_firma: "2025-02-10", objeto: "prestacion de servicios de apoyo" },
      { fecha_firma: "2025-03-10", objeto: "Prestación de Servicios de Apoyo." },
      { fecha_firma: "2025-04-05", objeto: "PRESTACION  DE  SERVICIOS  DE  APOYO" },
    ]);
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).not.toBeNull();
  });

  it("agrupando objetos que solo difieren después del carácter 60", () => {
    // En SECOP el objeto suele cerrar con el número de contrato o la vigencia.
    // Los primeros 60 caracteres normalizados son idénticos en los cuatro.
    const cs = grupo([
      {
        fecha_firma: "2025-01-10",
        objeto: "Prestación de servicios profesionales de apoyo jurídico a la entidad, contrato 001 de 2025",
      },
      {
        fecha_firma: "2025-02-10",
        objeto: "Prestación de servicios profesionales de apoyo jurídico a la entidad, contrato 002 de 2025",
      },
      {
        fecha_firma: "2025-03-10",
        objeto: "Prestación de servicios profesionales de apoyo jurídico a la entidad, contrato 003 de 2025",
      },
      {
        fecha_firma: "2025-04-05",
        objeto: "Prestación de servicios profesionales de apoyo jurídico a la entidad, contrato 004 de 2025",
      },
    ]);
    const f = fraccionamiento.run(cs[0], ctxOf(cs));
    expect(f).not.toBeNull();
    expect(f!.evidence.objeto_prefijo_chars).toBe(60);
    expect(String(f!.evidence.objeto_clave)).toHaveLength(60);
  });

  it("con un detail en español que no acusa", () => {
    const cs = grupoQueDispara();
    const { detail } = fraccionamiento.run(cs[0], ctxOf(cs))!;
    expect(detail).toContain("4");
    expect(detail).toContain("SECOP");
    expect(detail).not.toMatch(/corrupci|delito|fraude|culpab/i);
  });
});

describe("FRACCIONAMIENTO — no dispara", () => {
  it("con solo 3 contratos, justo debajo del mínimo", () => {
    const cs = grupo([
      { fecha_firma: "2025-01-10" },
      { fecha_firma: "2025-02-10" },
      { fecha_firma: "2025-03-10" },
    ]);
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("cuando los 4 se reparten en más de 90 días", () => {
    const cs = grupo([
      { fecha_firma: "2025-01-10" },
      { fecha_firma: "2025-02-10" },
      { fecha_firma: "2025-03-10" },
      { fecha_firma: "2025-05-01" },
    ]);
    for (const c of cs) {
      expect(fraccionamiento.run(c, ctxOf(cs))).toBeNull();
    }
  });

  it("cuando uno de los 4 supera el techo de cuantía y deja solo 3", () => {
    const cs = grupo([
      { fecha_firma: "2025-01-10" },
      { fecha_firma: "2025-02-10" },
      { fecha_firma: "2025-03-10" },
      { fecha_firma: "2025-04-05", valor_contrato: 60_000_000 },
    ]);
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("sobre un contrato grande, aunque sus pares sean pequeños", () => {
    const cs = grupoQueDispara();
    cs[0].valor_contrato = 80_000_000;
    // Un contrato grande no es una porción de una compra partida.
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("cuando los objetos difieren dentro de los primeros 60 caracteres", () => {
    // Comparten la fórmula de apertura pero divergen en la materia del
    // contrato: jurídico, contable, técnico, ambiental. No son la misma compra.
    const cs = grupo([
      { fecha_firma: "2025-01-10", objeto: "Prestación de servicios profesionales de apoyo jurídico a la entidad" },
      { fecha_firma: "2025-02-10", objeto: "Prestación de servicios profesionales de apoyo contable a la entidad" },
      { fecha_firma: "2025-03-10", objeto: "Prestación de servicios profesionales de apoyo técnico a la entidad" },
      { fecha_firma: "2025-04-05", objeto: "Prestación de servicios profesionales de apoyo ambiental a la entidad" },
    ]);
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("cuando los objetos son distintos entre sí", () => {
    const cs = grupo([
      { fecha_firma: "2025-01-10", objeto: "Compra de papelería" },
      { fecha_firma: "2025-02-10", objeto: "Mantenimiento de vehículos" },
      { fecha_firma: "2025-03-10", objeto: "Servicios de vigilancia" },
      { fecha_firma: "2025-04-05", objeto: "Suministro de combustible" },
    ]);
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("cuando los contratos son de proveedores distintos", () => {
    const cs = grupo([
      { fecha_firma: "2025-01-10", documento_proveedor: "1" },
      { fecha_firma: "2025-02-10", documento_proveedor: "2" },
      { fecha_firma: "2025-03-10", documento_proveedor: "3" },
      { fecha_firma: "2025-04-05", documento_proveedor: "4" },
    ]);
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });
});

describe("FRACCIONAMIENTO — bordes de datos ausentes", () => {
  it("sin NIT de entidad no hay con qué agrupar", () => {
    const cs = grupoQueDispara();
    cs.forEach((c) => (c.nit_entidad = null));
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("sin documento de proveedor no hay con qué agrupar", () => {
    const cs = grupoQueDispara();
    cs.forEach((c) => (c.documento_proveedor = null));
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("sin fecha de firma en el contrato evaluado", () => {
    const cs = grupoQueDispara();
    cs[0].fecha_firma = null;
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("con objeto nulo o vacío, que si no colapsaría todo en un mismo grupo", () => {
    const cs = grupoQueDispara();
    cs.forEach((c) => (c.objeto = null));
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("con valor de contrato nulo", () => {
    const cs = grupoQueDispara();
    cs[0].valor_contrato = null;
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("con valor cero, que sigue siendo un contrato pequeño válido", () => {
    const cs = grupoQueDispara();
    cs.forEach((c) => (c.valor_contrato = 0));
    const f = fraccionamiento.run(cs[0], ctxOf(cs));
    expect(f).not.toBeNull();
    expect(f!.evidence.valor_total_ventana).toBe(0);
  });
});
