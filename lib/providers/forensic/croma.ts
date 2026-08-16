/**
 * ForensicProvider — implementación sobre Croma.
 *
 * Presupuesto duro de 5 llamadas por expediente (METODOLOGIA §4 del plan de
 * Capa C). El rate limit de la cuenta es de 500/día, así que un análisis en
 * vivo sin tope vaciaría la cuota en 100 clics del jurado.
 *
 * Reglas de operación:
 *   - timeout de 45 s por llamada: contraloría llegó a tardar 37 s en el sondeo;
 *   - si `x-ratelimit-remaining` baja de 50, solo se atiende prioridad P1 y el
 *     resto se salta dejando nota en el log;
 *   - todo resultado se cachea en `deep_analyses.forensic`, así que el segundo
 *     clic sobre el mismo contrato es instantáneo y cuesta cero.
 *
 * Todos los cruces son por NÚMERO DE DOCUMENTO. Croma expone búsquedas por
 * nombre; no se usan: METODOLOGIA §6.6 solo admite confianza alta en cruces por
 * documento, porque el nombre produce homonimia.
 */

export const CROMA_BASE = "https://api.croma.run";
const UA = "TekelAgent/0.1 (auditoria de contratacion publica; +https://github.com/tekelagent/tekel-ai)";
const TIMEOUT_MS = 45_000;

/** Bajo este umbral de cuota restante solo se atiende lo urgente. */
export const RATE_LIMIT_RESERVA = 50;

export type CromaRespuesta<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  ms: number;
  /** Cuota restante que reportó la API en esta llamada. */
  rateRemaining: number | null;
  error: string | null;
};

export type PerfilForense = {
  rues: unknown | null;
  contraloria: unknown | null;
  procuraduria: unknown | null;
  contaduria: unknown | null;
  contratos_proveedor: unknown | null;
  /** Llamadas efectivamente hechas, para auditar el presupuesto. */
  llamadas: number;
  /** Endpoints que se saltaron y por qué. */
  omitidos: Array<{ endpoint: string; motivo: string }>;
  consultado_el: string;
  rate_remaining_final: number | null;
};

export interface ForensicProvider {
  readonly name: string;
  perfilDeContratista(
    documento: string,
    opts?: { esPrioritario?: boolean; onLog?: (msg: string) => void },
  ): Promise<PerfilForense>;
}

export class CromaProvider implements ForensicProvider {
  readonly name = "croma";
  private readonly apiKey: string;
  private readonly base: string;

  constructor(opts: { apiKey?: string; base?: string } = {}) {
    const key = opts.apiKey ?? process.env.CROMA_API_KEY;
    if (!key) throw new Error("Falta CROMA_API_KEY");
    this.apiKey = key;
    this.base = (opts.base ?? CROMA_BASE).replace(/\/$/, "");
  }

  private async post<T>(path: string, body: unknown): Promise<CromaRespuesta<T>> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const t0 = Date.now();
    try {
      const res = await fetch(`${this.base}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": UA,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const texto = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(texto);
      } catch {
        /* respuesta no JSON */
      }
      const remaining = res.headers.get("x-ratelimit-remaining");
      return {
        ok: res.ok,
        status: res.status,
        // La API envuelve todo en { data }.
        data: res.ok ? (json?.data ?? json ?? null) : null,
        ms: Date.now() - t0,
        rateRemaining: remaining === null ? null : Number(remaining),
        error: res.ok ? null : (json?.error?.message ?? texto.slice(0, 200)),
      };
    } catch (err) {
      const msg = (err as Error).name === "AbortError" ? `timeout tras ${TIMEOUT_MS / 1000}s` : (err as Error).message;
      return { ok: false, status: 0, data: null, ms: Date.now() - t0, rateRemaining: null, error: msg };
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Las cinco consultas del presupuesto, en orden de valor decreciente: si la
   * cuota se agota a mitad, lo que se pierde es lo menos decisivo.
   */
  async perfilDeContratista(
    documento: string,
    opts: { esPrioritario?: boolean; onLog?: (msg: string) => void } = {},
  ): Promise<PerfilForense> {
    const log = opts.onLog ?? (() => {});
    const perfil: PerfilForense = {
      rues: null,
      contraloria: null,
      procuraduria: null,
      contaduria: null,
      contratos_proveedor: null,
      llamadas: 0,
      omitidos: [],
      consultado_el: new Date().toISOString(),
      rate_remaining_final: null,
    };

    const pasos: Array<{ clave: keyof PerfilForense; path: string; etiqueta: string }> = [
      { clave: "rues", path: "/co/rues/entity-by-nit/v1", etiqueta: "RUES (existencia y representación)" },
      { clave: "contraloria", path: "/co/contraloria/fiscal-records/v1", etiqueta: "Contraloría (responsabilidad fiscal)" },
      { clave: "procuraduria", path: "/co/procuraduria/disciplinary-records/v1", etiqueta: "Procuraduría (antecedentes)" },
      { clave: "contaduria", path: "/co/contaduria/state-delinquent-debtors/v1", etiqueta: "Contaduría (deudores morosos)" },
      { clave: "contratos_proveedor", path: "/co/secop/contracts-by-provider/v1", etiqueta: "SECOP (contratos del proveedor)" },
    ];

    for (const paso of pasos) {
      // Reserva de cuota: por debajo del umbral solo pasa lo prioritario.
      if (
        perfil.rate_remaining_final !== null &&
        perfil.rate_remaining_final < RATE_LIMIT_RESERVA &&
        !opts.esPrioritario
      ) {
        perfil.omitidos.push({
          endpoint: paso.path,
          motivo: `cuota diaria por debajo de ${RATE_LIMIT_RESERVA}; reservada para prioridad P1`,
        });
        log(`Omitido ${paso.etiqueta}: cuota diaria baja, reservada para casos P1.`);
        continue;
      }

      log(`Consultando ${paso.etiqueta}…`);
      const r = await this.post(paso.path, { document_number: documento });
      perfil.llamadas += 1;
      if (r.rateRemaining !== null) perfil.rate_remaining_final = r.rateRemaining;

      if (r.ok) {
        (perfil as Record<string, unknown>)[paso.clave] = r.data;
        log(`  ✓ ${paso.etiqueta} — ${resumirRespuesta(paso.clave, r.data)} (${(r.ms / 1000).toFixed(1)}s)`);
      } else {
        perfil.omitidos.push({ endpoint: paso.path, motivo: r.error ?? `HTTP ${r.status}` });
        log(`  ✗ ${paso.etiqueta} — ${r.error ?? `HTTP ${r.status}`}`);
      }
    }

    return perfil;
  }
}

/** Una línea humana por respuesta, para que el log cuente algo al ciudadano. */
function resumirRespuesta(clave: string, data: unknown): string {
  const d = data as Record<string, any> | null;
  if (!d) return "sin datos";
  switch (clave) {
    case "rues": {
      if (d.found === false) return "no encontrado en RUES";
      const e = d.entity ?? {};
      const partes = [e.razon_social ?? e.name, e.fecha_matricula ?? e.registration_date, e.estado ?? e.status]
        .filter(Boolean)
        .map(String);
      return partes.length ? partes.join(" · ") : "encontrado";
    }
    case "contraloria":
      return d.is_fiscal_responsible ? "CON responsabilidad fiscal" : "sin responsabilidad fiscal";
    case "procuraduria":
      return d.has_records ? `${(d.records ?? []).length} antecedente(s)` : "sin antecedentes";
    case "contaduria":
      return d.deudor_moroso || d.reported ? "reportado como deudor moroso" : "sin reporte de morosidad";
    case "contratos_proveedor":
      return `${d.count ?? (d.contracts ?? []).length} contratos en SECOP`;
    default:
      return "ok";
  }
}

/** Provider por defecto. */
export function createForensicProvider(): ForensicProvider {
  return new CromaProvider();
}
