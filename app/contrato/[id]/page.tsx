"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Scale } from "lucide-react";
import { AnalisisEnVivo } from "@/app/components/AnalisisEnVivo";
import { Hallazgo, type HallazgoUI } from "@/app/components/Hallazgo";
import { ScoreRing } from "@/app/components/ScoreRing";
import {
  AVISO_LEGAL,
  ETIQUETA_PRIORIDAD,
  colorRiesgo,
  cop,
  fecha,
  tonoPrioridad,
} from "@/lib/ui/formato";

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
        <p className="rounded-xl border border-crit/30 bg-crit-soft p-4 text-sm text-crit">
          {error}
        </p>
      </Marco>
    );
  }
  if (!datos) {
    return (
      <Marco>
        <p className="py-16 text-center text-sm text-muted-foreground">Cargando expediente…</p>
      </Marco>
    );
  }

  const { expediente: e, capa_c } = datos;
  const h = e.encabezado;
  const t = e.triaje;
  const forense = capa_c?.forensic;
  const tono = tonoPrioridad(t.prioridad);
  const color = colorRiesgo(t.risk_level);

  return (
    <Marco>
      {/* ── Encabezado ────────────────────────────────────────────── */}
      <section className="card-soft p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {t.prioridad && (
            <span className={`badge-pill font-semibold ${tono.text} ${tono.bg}`}>
              {ETIQUETA_PRIORIDAD[t.prioridad] ?? t.prioridad}
            </span>
          )}
          <span className="num font-mono text-[11px] text-muted-foreground">{h.id_contrato}</span>
          {h.avisos?.map((a: string) => (
            <span key={a} className="badge-pill bg-warn-soft text-warn">
              {a}
            </span>
          ))}
        </div>

        <h1 className="text-xl font-bold leading-snug text-foreground">{h.entidad}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contratista: <span className="text-foreground">{h.contratista}</span>
          {h.documento_proveedor ? ` · doc. ${h.documento_proveedor}` : ""}
        </p>

        <p className="mt-3 text-sm leading-relaxed text-foreground/85">{h.objeto}</p>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Dato etiqueta="Valor" valor={cop(h.valor_contrato, false)} />
          <Dato
            etiqueta={h.vigencia === "vigente" ? "Sin desembolsar" : "Ya pagado"}
            valor={cop(t.plata_en_riesgo, false)}
            color={color}
          />
          <Dato etiqueta="Estado" valor={h.estado ?? "—"} />
          <Dato etiqueta="Firma" valor={fecha(datos.contrato?.fecha_firma)} />
        </dl>

        {h.url_secop && (
          <a
            href={h.url_secop}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2
                       text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
          >
            Ver en SECOP
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </section>

      {/* ── Score y por qué ahora ─────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-[190px_1fr]">
        <div className="card-soft flex flex-col items-center justify-center gap-3 p-6">
          <ScoreRing score={t.risk_score} color={color} size={104} stroke={9} fontSize={30} />
          <p className="label-eyebrow" style={{ color }}>
            {t.risk_level}
          </p>
        </div>
        <div className="card-soft p-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Por qué revisar ahora</h2>
          {t.porque_ahora.length ? (
            <ul className="space-y-2.5">
              {t.porque_ahora.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-foreground/85">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Este contrato no entró al triaje: su score está por debajo del umbral.
            </p>
          )}
        </div>
      </section>

      {/* ── Hallazgos ─────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Hallazgos ({e.hallazgos.length})
        </h2>
        {e.hallazgos.length ? (
          <div className="space-y-3">
            {e.hallazgos.map((x, i) => (
              <Hallazgo key={`${x.pattern_code}-${i}`} h={x} />
            ))}
          </div>
        ) : (
          <p className="card-soft p-6 text-sm text-muted-foreground">
            El motor no encontró indicadores de riesgo en este contrato.
          </p>
        )}
      </section>

      {/* ── Perfil forense ────────────────────────────────────────── */}
      <section className="card-soft p-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
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
            <p className="mt-3 text-[11px] text-muted-foreground">
              Consultado el {String(forense.consultado_el ?? "").slice(0, 10)} · {forense.llamadas}{" "}
              consultas
              {forense.omitidos?.length ? ` · ${forense.omitidos.length} omitidas` : ""}
            </p>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Verifica al contratista en RUES, Contraloría, Procuraduría y SECOP, y busca
              requisitos restrictivos en el pliego.
            </p>
            <AnalisisEnVivo idContrato={idContrato} onTerminado={cargar} />
          </div>
        )}
      </section>

      {/* ── Pliego ────────────────────────────────────────────────── */}
      {(capa_c?.pliego?.hallazgos?.length ?? 0) > 0 && (
        <section className="card-soft p-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Análisis del pliego</h2>
          <div className="space-y-3">
            {capa_c!.pliego.hallazgos.map((p: any, i: number) => (
              <div key={i} className="rounded-xl bg-muted/60 p-4">
                <p className="text-sm leading-relaxed text-foreground/85">{p.hallazgo}</p>
                <blockquote
                  className="mt-2 border-l-2 pl-3 text-sm italic leading-relaxed text-muted-foreground"
                  style={{ borderColor: "var(--brand-via)" }}
                >
                  «{p.cita_textual}»
                </blockquote>
                <p className="num mt-2 font-mono text-[11px] text-muted-foreground">
                  {p.archivo ?? "pliego"} · página {p.pagina}
                </p>
              </div>
            ))}
          </div>
          {capa_c?.modelo && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Analizado con {capa_c.modelo} · ${capa_c.costo_usd.toFixed(4)} USD
            </p>
          )}
        </section>
      )}

      {/* ── Líneas de verificación ────────────────────────────────── */}
      {e.lineas_de_verificacion.length > 0 && (
        <section className="card-soft p-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Líneas de verificación sugeridas
          </h2>
          <ol className="space-y-2.5">
            {e.lineas_de_verificacion.map((l, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground/85">
                <span className="num shrink-0 font-mono text-muted-foreground">{i + 1}.</span>
                <span className="break-all">{l}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Trazabilidad ──────────────────────────────────────────── */}
      <section className="card-soft p-6">
        <h2 className="label-eyebrow mb-2">Trazabilidad</h2>
        <dl className="grid gap-x-6 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-2">
          <div>Catálogo normativo: v{e.trazabilidad.catalogo_normativo_version}</div>
          <div>Fuente: {e.trazabilidad.fuente_datos}</div>
          <div>Generado: {String(e.trazabilidad.generado_el).slice(0, 19).replace("T", " ")}</div>
          <div>Capas aplicadas: {e.trazabilidad.capas_aplicadas}</div>
        </dl>
        <p className="mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted-foreground">
          {AVISO_LEGAL}
        </p>
      </section>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-hairline bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold transition hover:text-primary"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span className="icon-tile bg-brand-gradient size-7">
              <Scale className="size-4" aria-hidden="true" />
            </span>
            Tekel<span className="text-gradient">Agent</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-6 py-6">{children}</main>
      <footer className="border-t border-hairline px-6 py-6">
        <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-muted-foreground">
          {AVISO_LEGAL}
        </p>
      </footer>
    </div>
  );
}

function Dato({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <div>
      <dt className="label-eyebrow">{etiqueta}</dt>
      <dd
        className="num mt-1 font-mono text-sm font-semibold tabular-nums"
        style={{ color: color ?? "var(--foreground)" }}
      >
        {valor}
      </dd>
    </div>
  );
}

function FilaForense({ titulo, dato, tipo }: { titulo: string; dato: any; tipo: string }) {
  let texto = "no consultado";
  let alerta = false;

  if (dato) {
    if (tipo === "rues") {
      const en = dato.entity ?? {};
      texto =
        dato.found === false ? "no encontrado en RUES" : (en.razon_social ?? en.name ?? "encontrado");
      if (en.fecha_matricula ?? en.registration_date) {
        texto += ` · desde ${String(en.fecha_matricula ?? en.registration_date).slice(0, 10)}`;
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
    <div className="flex items-baseline justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
      <span className="label-eyebrow">{titulo}</span>
      <span className={`text-xs ${alerta ? "font-semibold text-crit" : "text-foreground/85"}`}>
        {texto}
      </span>
    </div>
  );
}
