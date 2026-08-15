import { describe, expect, it } from "vitest";
import { adiciones50 } from "../adiciones-50";
import { contract, soloCtx } from "./fixtures";

/** Contrato con plazo original de 100 días más los días adicionados que se pasen. */
function conProrroga(diasAdicionados: number, plazoOriginal = 100) {
  const total = plazoOriginal + diasAdicionados;
  const inicio = new Date(Date.UTC(2025, 0, 1));
  const fin = new Date(inicio.getTime() + total * 86_400_000);
  return contract({
    dias_adicionados: diasAdicionados,
    fecha_inicio: "2025-01-01",
    fecha_fin: fin.toISOString().slice(0, 10),
    valor_contrato: 500_000_000,
  });
}
const run = (c: ReturnType<typeof contract>) => adiciones50.run(c, soloCtx(c));

describe("ADICIONES_50 — dispara", () => {
  it("con una prórroga de exactamente el 50% del plazo original", () => {
    const f = run(conProrroga(50));
    expect(f).not.toBeNull();
    expect(f!.evidence.fraccion_prorroga).toBe(0.5);
  });

  it("con 40 puntos y severidad crítica", () => {
    const f = run(conProrroga(120))!;
    expect(f.points).toBe(40);
    expect(f.severity).toBe("critica");
    expect(f.foco).toBe("entidad");
  });

  it("SIEMPRE con confianza baja: mide tiempo, no valor", () => {
    const f = run(conProrroga(200))!;
    expect(f.confianza).toBe("baja");
  });
});

describe("ADICIONES_50 — declara su aproximación (METODOLOGIA §3)", () => {
  it("marca evidence.aproximacion = true", () => {
    const f = run(conProrroga(80))!;
    expect(f.evidence.aproximacion).toBe(true);
  });

  it("deja explícito que la magnitud medida no es la de la norma", () => {
    const f = run(conProrroga(80))!;
    expect(f.evidence.magnitud_medida).toBe("tiempo");
    expect(f.evidence.magnitud_de_la_norma).toContain("valor");
    expect(f.evidence.aproximacion_motivo).toContain("no publica valor inicial");
  });

  it("apunta al dataset que sí traería el valor real", () => {
    const f = run(conProrroga(80))!;
    expect(String(f.evidence.dataset_con_valor_real)).toContain("cb9c-h8sn");
  });

  it("el detail advierte al ciudadano de la limitación, no la esconde", () => {
    const { detail } = run(conProrroga(80))!;
    expect(detail).toContain("TIEMPO");
    expect(detail).toContain("no implica haber adicionado dinero");
    expect(detail).toContain("Ley 80 de 1993, art. 40, parágrafo");
  });
});

describe("ADICIONES_50 — no dispara", () => {
  it("con una prórroga del 49%, debajo del umbral", () => {
    expect(run(conProrroga(49))).toBeNull();
  });

  it("sin días adicionados", () => {
    expect(run(conProrroga(0))).toBeNull();
  });

  it("con días adicionados negativos, que serían un dato corrupto", () => {
    const c = conProrroga(50);
    c.dias_adicionados = -10;
    expect(run(c)).toBeNull();
  });

  it.each([
    ["dias_adicionados nulo", { dias_adicionados: null }],
    ["sin fecha de inicio", { fecha_inicio: null }],
    ["sin fecha de fin", { fecha_fin: null }],
  ])("se abstiene con %s", (_t, patch) => {
    const c = conProrroga(80);
    Object.assign(c, patch);
    expect(run(c)).toBeNull();
  });

  it("cuando los días adicionados exceden el plazo total, que es incoherente", () => {
    const c = conProrroga(50, 100);
    c.dias_adicionados = 500; // más que la duración total
    expect(run(c)).toBeNull();
  });

  it("en contratos que nunca se ejecutaron", () => {
    const c = conProrroga(80);
    c.vigencia = "otro";
    expect(run(c)).toBeNull();
  });
});
