"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnalisisEnVivo } from "@/app/components/AnalisisEnVivo";
import { Hallazgo, type HallazgoUI } from "@/app/components/Hallazgo";
import { AVISO_LEGAL, COLOR_PRIORIDAD, ETIQUETA_PRIORIDAD, cop, fecha } from "@/lib/ui/formato";

type Respuesta = {
  expediente: {
    encabezado: Record<string, any>;
    triaje: {
      prioridad: string | null;
      risk_score: number;
      risk_level: string;
      plata_en_riesgo: number | null;
      porque_ahora: string[];
    };
    hallazgos: HallazgoUI[];
    lineas_de_verificacion: string[];
    trazabilidad: Record<string, string>;
    aviso: string;
  };
  contrato: Record<string, any>;
  capa_c: {
    status: string;
    forensic: any;
    pliego: any;
    modelo: string | null;
    costo_usd: number;
  } | null;
  documentos: Array<Record<string, any>>;
  error?: string;
};

export default function DetalleContrato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const idContrato = decodeURIComponent(id);

  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/contracts/${encodeURIComponent(idContrato)}`);
    const j = (await r.json()) as Respuesta;
    if (!r.ok) setError(j.error ?? "No se pudo cargar el contrato");
    else setDatos(j);
  }, [idContrato]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (error) {
    return (
      <Marco>
        <p className="rounded-lg border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-300">
          {error}
        </p>
      </Marco>
    );
  }
  if (!datos) {
    return (
      <Marco>
        <p className="py-16 text-center text-sm text-slate-500">Cargando expediente…</p>
      </Marco>
    );
  }

  const { expediente: e, capa_c } = datos;
  const h = e.encabezado;
  const t = e.triaje;
  const forense = capa_c?.forensic;

  return (
    <Marco>
      {/* ── Encabezado ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {t.prioridad && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                COLOR_PRIORIDAD[t.prioridad] ?? ""
              }`}
            >
              {ETIQUETA_PRIORIDAD[t.prioridad] ?? t.prioridad}
            </span>
          )}
          <span className="font-mono text-[11px] text-slate-500">{h.id_contrato}</span>
          {h.avisos?.map((a: string) => (
            <span
              key={a}
              className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] text-orange-300 ring-1 ring-inset ring-orange-500/30"
            >
              {a}
            </span>
          ))}
        </div>

        <h1 className="text-lg font-bold leading-snug text-slate-100">{h.entidad}</h1>
        <p className="mt-1 text-sm text-slate-400">
          Contratista: <span className="text-slate-300">{h.contratista}</span>
          {h.documento_proveedor ? ` · doc. ${h.documento_proveedor}` : ""}
        </p>

        <p className="mt-3 text-xs leading-relaxed text-slate-400">{h.objeto}</p>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Dato etiqueta="Valor" valor={cop(h.valor_contrato, false)} />
          <Dato
            etiqueta={h.vigencia === "vigente" ? "Sin desembolsar" : "Ya pagado"}
            valor={cop(t.plata_en_riesgo, false)}
            acento
          />
          <Dato etiqueta="Estado" valor={h.estado ?? "—"} />
          <Dato etiqueta="Firma" valor={fecha(datos.contrato?.fecha_firma)} />
        </dl>

        {h.url_secop && (
          <a
            href={h.url_secop}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5
                       text-xs font-medium text-slate-200 transition hover:border-sky-600 hover:text-sky-300"
          >
            Ver en SECOP ↗
          </a>
        )}
      </section>

      {/* ── Score y por qué ahora ─────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <Gauge score={t.risk_score} nivel={t.risk_level} />
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-100">Por qué revisar ahora</h2>
          {t.porque_ahora.length ? (
            <ul className="space-y-2">
              {t.porque_ahora.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-slate-300">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sky-400" />
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">
              Este contrato no entró al triaje: su score está por debajo del umbral.
            </p>
          )}
        </div>
      </section>

      {/* ── Hallazgos ─────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-100">
          Hallazgos ({e.hallazgos.length})
        </h2>
        {e.hallazgos.length ? (
          <div className="space-y-2">
            {e.hallazgos.map((x, i) => (
              <Hallazgo key={`${x.pattern_code}-${i}`} h={x} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-xs text-slate-500">
            El motor no encontró indicadores de riesgo en este contrato.
          </p>
        )}
      </section>

      {/* ── Perfil forense ────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-100">
          Perfil forense del contratista
        </h2>
        {forense ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <FilaForense titulo="RUES" dato={forense.rues} tipo="rues" />
              <FilaForense titulo="Contraloría" dato={forense.contraloria} tipo="contraloria" />
              <FilaForense titulo="Procuraduría" dato={forense.procuraduria} tipo="procuraduria" />
              <FilaForense titulo="Contaduría (BDME)" dato={forense.contaduria} tipo="contaduria" />
              <FilaForense
                titulo="Contratos en SECOP"
                dato={forense.contratos_proveedor}
                tipo="contratos"
              />
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              Consultado el {String(forense.consultado_el ?? "").slice(0, 10)} ·{" "}
              {forense.llamadas} consultas
              {forense.omitidos?.length ? ` · ${forense.omitidos.length} omitidas` : ""}
            </p>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-slate-400">
              Verifica al contratista en RUES, Contraloría, Procuraduría y SECOP, y busca
              requisitos restrictivos en el pliego.
            </p>
            <AnalisisEnVivo idContrato={idContrato} onTerminado={cargar} />
          </div>
        )}
      </section>

      {/* ── Documentos ────────────────────────────────────────────── */}
      {(capa_c?.pliego?.hallazgos?.length ?? 0) > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-100">Análisis del pliego</h2>
          <div className="space-y-3">
            {capa_c!.pliego.hallazgos.map((p: any, i: number) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-xs leading-relaxed text-slate-300">{p.hallazgo}</p>
                <blockquote className="mt-2 border-l-2 border-sky-700 pl-3 text-xs italic leading-relaxed text-slate-400">
                  «{p.cita_textual}»
                </blockquote>
                <p className="mt-1.5 font-mono text-[11px] text-slate-500">
                  {p.archivo ?? "pliego"} · página {p.pagina}
                </p>
              </div>
            ))}
          </div>
          {capa_c?.modelo && (
            <p className="mt-3 text-[11px] text-slate-500">
              Analizado con {capa_c.modelo} · ${capa_c.costo_usd.toFixed(4)} USD
            </p>
          )}
        </section>
      )}

      {/* ── Líneas de verificación ────────────────────────────────── */}
      {e.lineas_de_verificacion.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-100">
            Líneas de verificación sugeridas
          </h2>
          <ol className="space-y-2">
            {e.lineas_de_verificacion.map((l, i) => (
              <li key={i} className="flex gap-3 text-xs leading-relaxed text-slate-300">
                <span className="shrink-0 font-mono text-slate-600">{i + 1}.</span>
                <span className="break-all">{l}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Trazabilidad y aviso ──────────────────────────────────── */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/20 p-5">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Trazabilidad
        </h2>
        <dl className="grid gap-x-6 gap-y-1 text-[11px] text-slate-500 sm:grid-cols-2">
          <div>Catálogo normativo: v{e.trazabilidad.catalogo_normativo_version}</div>
          <div>Fuente: {e.trazabilidad.fuente_datos}</div>
          <div>Generado: {String(e.trazabilidad.generado_el).slice(0, 19).replace("T", " ")}</div>
          <div>Capas aplicadas: {e.trazabilidad.capas_aplicadas}</div>
        </dl>
        <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
          {AVISO_LEGAL}
        </p>
      </section>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
          <Link href="/" className="text-sm font-bold tracking-tight hover:text-sky-300">
            ← Tekel<span className="text-sky-400">Agent</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-5 px-6 py-6">{children}</main>
      <footer className="border-t border-slate-800 px-6 py-6">
        <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-slate-500">
          {AVISO_LEGAL}
        </p>
      </footer>
    </div>
  );
}

function Dato({ etiqueta, valor, acento }: { etiqueta: string; valor: string; acento?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{etiqueta}</dt>
      <dd
        className={`mt-0.5 font-mono text-sm tabular-nums ${acento ? "text-sky-300" : "text-slate-200"}`}
      >
        {valor}
      </dd>
    </div>
  );
}

function Gauge({ score, nivel }: { score: number; nivel: string }) {
  const pct = Math.min(100, Math.max(0, score));
  const color =
    nivel === "critico" ? "text-rose-400" : nivel === "medio" ? "text-amber-400" : "text-slate-500";
  const r = 42;
  const circ = 2 * Math.PI * r;

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-slate-800" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circ} ${circ}`}
          className={`${color} stroke-current transition-all duration-700`}
        />
      </svg>
      <p className={`-mt-[4.6rem] font-mono text-2xl font-bold tabular-nums ${color}`}>{score}</p>
      <p className="mt-[2.6rem] text-[11px] uppercase tracking-wide text-slate-500">{nivel}</p>
    </div>
  );
}

function FilaForense({ titulo, dato, tipo }: { titulo: string; dato: any; tipo: string }) {
  let texto = "no consultado";
  let alerta = false;

  if (dato) {
    if (tipo === "rues") {
      const e = dato.entity ?? {};
      texto = dato.found === false ? "no encontrado en RUES" : (e.razon_social ?? e.name ?? "encontrado");
      if (e.fecha_matricula ?? e.registration_date) {
        texto += ` · desde ${String(e.fecha_matricula ?? e.registration_date).slice(0, 10)}`;
      }
    } else if (tipo === "contraloria") {
      alerta = Boolean(dato.is_fiscal_responsible);
      texto = alerta ? "CON responsabilidad fiscal" : "sin responsabilidad fiscal";
    } else if (tipo === "procuraduria") {
      alerta = Boolean(dato.has_records);
      texto = alerta ? `${(dato.records ?? []).length} antecedente(s)` : "sin antecedentes";
    } else if (tipo === "contaduria") {
      alerta = Boolean(dato.deudor_moroso || dato.reported);
      texto = alerta ? "reportado como deudor moroso" : "sin reporte de morosidad";
    } else {
      texto = `${dato.count ?? (dato.contracts ?? []).length} contratos`;
    }
  }

  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-950/50 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{titulo}</span>
      <span className={`text-xs ${alerta ? "font-semibold text-rose-300" : "text-slate-300"}`}>
        {texto}
      </span>
    </div>
  );
}
