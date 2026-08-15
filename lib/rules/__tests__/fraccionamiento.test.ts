import { describe, expect, it } from "vitest";
import { fraccionamiento } from "../fraccionamiento";
import { contract, ctxOf } from "./fixtures";
import type { ContractRow } from "../types";

const grupo = (specs: Array<Partial<ContractRow>>) => specs.map((s) => contract(s));

/** Tres contratos pequeños del mismo objeto en 90 días: el caso canónico. */
const grupoQueDispara = () =>
  grupo([
    { fecha_firma: "2025-01-10" },
    { fecha_firma: "2025-02-10" },
    { fecha_firma: "2025-03-10" },
  ]);

describe("FRACCIONAMIENTO — dispara", () => {
  it("con 3 contratos pequeños del mismo objeto dentro de 12 meses", () => {
    const cs = grupoQueDispara();
    const f = fraccionamiento.run(cs[0], ctxOf(cs));
    expect(f).not.toBeNull();
    expect(f!.evidence.contratos_en_ventana).toBe(3);
  });

  it("para todos los contratos de la ventana, no solo el primero", () => {
    const cs = grupoQueDispara();
    const ctx = ctxOf(cs);
    for (const c of cs) expect(fraccionamiento.run(c, ctx)).not.toBeNull();
  });

  it("con contratos repartidos a lo largo de casi un año", () => {
    const cs = grupo([
      { fecha_firma: "2025-01-10" },
      { fecha_firma: "2025-06-10" },
      { fecha_firma: "2026-01-05" }, // 360 días del primero
    ]);
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).not.toBeNull();
  });

  it("con 30 puntos, severidad alta, confianza media y foco entidad", () => {
    const cs = grupoQueDispara();
    const f = fraccionamiento.run(cs[0], ctxOf(cs))!;
    expect(f.points).toBe(30);
    expect(f.severity).toBe("alta");
    // El techo de cuantía aproxima la menor cuantía real de la entidad.
    expect(f.confianza).toBe("media");
    expect(f.foco).toBe("entidad");
  });

  it("declarando que el techo de cuantía es una aproximación", () => {
    const cs = grupoQueDispara();
    const f = fraccionamiento.run(cs[0], ctxOf(cs))!;
    expect(f.evidence.valor_maximo_es_aproximacion).toBe(true);
    expect(f.evidence.valor_maximo_por_contrato).toBe(100_000_000);
  });

  it("listando cada contrato con su fecha y valor, verificable uno a uno", () => {
    const cs = grupoQueDispara();
    const f = fraccionamiento.run(cs[0], ctxOf(cs))!;
    const contratos = f.evidence.contratos as Array<Record<string, unknown>>;
    expect(contratos).toHaveLength(3);
    expect(contratos[0]).toHaveProperty("id_contrato");
  });

  it("ignorando tildes, mayúsculas y puntuación al comparar el objeto", () => {
    const cs = grupo([
      { fecha_firma: "2025-01-10", objeto: "PRESTACIÓN DE SERVICIOS DE APOYO" },
      { fecha_firma: "2025-02-10", objeto: "prestacion de servicios de apoyo" },
      { fecha_firma: "2025-03-10", objeto: "Prestación de Servicios de Apoyo." },
    ]);
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).not.toBeNull();
  });

  it("agrupando objetos que solo difieren después del carácter 60", () => {
    const base = "Prestación de servicios profesionales de apoyo jurídico a la entidad";
    const cs = grupo([
      { fecha_firma: "2025-01-10", objeto: `${base}, contrato 001 de 2025` },
      { fecha_firma: "2025-02-10", objeto: `${base}, contrato 002 de 2025` },
      { fecha_firma: "2025-03-10", objeto: `${base}, contrato 003 de 2025` },
    ]);
    const f = fraccionamiento.run(cs[0], ctxOf(cs));
    expect(f).not.toBeNull();
    expect(f!.evidence.objeto_prefijo_chars).toBe(60);
  });

  it("cita la norma desde el catálogo y no acusa", () => {
    const cs = grupoQueDispara();
    const { detail } = fraccionamiento.run(cs[0], ctxOf(cs))!;
    expect(detail).toContain("Ley 80 de 1993, art. 24");
    expect(detail).toContain("SECOP");
    expect(detail).not.toMatch(/corrupci|delito|fraude|culpab/i);
  });
});

describe("FRACCIONAMIENTO — no dispara", () => {
  it("con solo 2 contratos, debajo del mínimo de METODOLOGIA", () => {
    const cs = grupo([{ fecha_firma: "2025-01-10" }, { fecha_firma: "2025-02-10" }]);
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("cuando se reparten en más de 12 meses", () => {
    const cs = grupo([
      { fecha_firma: "2025-01-10" },
      { fecha_firma: "2026-02-10" },
      { fecha_firma: "2027-03-10" },
    ]);
    for (const c of cs) expect(fraccionamiento.run(c, ctxOf(cs))).toBeNull();
  });

  it("cuando uno supera el techo de cuantía y deja solo 2", () => {
    const cs = grupo([
      { fecha_firma: "2025-01-10" },
      { fecha_firma: "2025-02-10" },
      { fecha_firma: "2025-03-10", valor_contrato: 150_000_000 },
    ]);
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("sobre un contrato grande, aunque sus pares sean pequeños", () => {
    const cs = grupoQueDispara();
    cs[0].valor_contrato = 800_000_000;
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("cuando los objetos difieren dentro de los primeros 60 caracteres", () => {
    const cs = grupo([
      { fecha_firma: "2025-01-10", objeto: "Prestación de servicios profesionales de apoyo jurídico" },
      { fecha_firma: "2025-02-10", objeto: "Prestación de servicios profesionales de apoyo contable" },
      { fecha_firma: "2025-03-10", objeto: "Prestación de servicios profesionales de apoyo técnico" },
    ]);
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("cuando son de proveedores distintos", () => {
    const cs = grupo([
      { fecha_firma: "2025-01-10", documento_proveedor: "1" },
      { fecha_firma: "2025-02-10", documento_proveedor: "2" },
      { fecha_firma: "2025-03-10", documento_proveedor: "3" },
    ]);
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("ignora los contratos que nunca se ejecutaron al contar la ventana", () => {
    const cs = grupoQueDispara();
    cs[1].vigencia = "otro";
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });
});

describe("FRACCIONAMIENTO — bordes de datos ausentes", () => {
  it.each([
    ["sin NIT de entidad", "nit_entidad"],
    ["sin documento de proveedor", "documento_proveedor"],
    ["con objeto nulo", "objeto"],
  ] as const)("se abstiene %s", (_t, campo) => {
    const cs = grupoQueDispara();
    cs.forEach((c) => ((c as Record<string, unknown>)[campo] = null));
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("se abstiene sin fecha de firma en el contrato evaluado", () => {
    const cs = grupoQueDispara();
    cs[0].fecha_firma = null;
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("se abstiene con valor nulo", () => {
    const cs = grupoQueDispara();
    cs[0].valor_contrato = null;
    expect(fraccionamiento.run(cs[0], ctxOf(cs))).toBeNull();
  });

  it("un valor de cero sigue siendo un contrato pequeño válido", () => {
    const cs = grupoQueDispara();
    cs.forEach((c) => (c.valor_contrato = 0));
    const f = fraccionamiento.run(cs[0], ctxOf(cs));
    expect(f).not.toBeNull();
    expect(f!.evidence.valor_total_ventana).toBe(0);
  });
});
