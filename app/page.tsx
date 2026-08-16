"use client";

import { useEffect, useMemo, useState } from "react";
import { Filtros, FILTROS_VACIOS, type EstadoFiltros } from "./components/Filtros";
import { TarjetaContrato, type ContratoLista } from "./components/TarjetaContrato";
import { AnalisisEnVivo } from "./components/AnalisisEnVivo";
import { AVISO_LEGAL, cop } from "@/lib/ui/formato";

const FORMA_SECOP = /^CO1\.[A-Z]+\.\d+$/i;

export default function Dashboard() {
  const [filtros, setFiltros] = useState<EstadoFiltros>(FILTROS_VACIOS);
  const [debounced, setDebounced] = useState(FILTROS_VACIOS);
  const [datos, setDatos] = useState<{ total: number; contratos: ContratoLista[] }>({
    total: 0,
    contratos: [],
  });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // El texto se debouncea; los selects aplican de inmediato.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(filtros), 350);
    return () => clearTimeout(t);
  }, [filtros]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(debounced)) if (v) p.set(k, String(v));
    p.set("limit", "40");

    fetch(`/api/contracts?${p}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j.error) setError(j.error);
        else {
          setDatos(j);
          setError(null);
        }
      })
      .catch((e) => vivo && setError(String(e.message)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [debounced]);

  // Las opciones de los selects salen de lo que hay en pantalla: sin una llamada
  // extra, y siempre coherentes con el corpus cargado.
  const departamentos = useMemo(
    () => [...new Set(datos.contratos.map((c) => c.departamento).filter(Boolean) as string[])].sort(),
    [datos.contratos],
  );
  const modalidades = useMemo(
    () => [...new Set(datos.contratos.map((c) => c.modalidad).filter(Boolean) as string[])].sort(),
    [datos.contratos],
  );

  const plataTotal = datos.contratos.reduce((a, c) => a + (c.plata_en_riesgo ?? 0), 0);
  const p1 = datos.contratos.filter((c) => c.prioridad === "P1").length;

  // Un id de SECOP que no está en el corpus se puede analizar en vivo.
  const busqueda = debounced.q.trim();
  const fueraDeCorpus =
    !cargando && FORMA_SECOP.test(busqueda) && datos.contratos.length === 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-baseline gap-4 px-6 py-5">
          <h1 className="text-xl font-bold tracking-tight">
            Tekel<span className="text-sky-400">Agent</span>
          </h1>
          <p className="hidden text-sm text-slate-400 sm:block">
            Auditoría de contratación pública · SECOP II
          </p>
          <p className="ml-auto text-xs text-slate-500">
            &ldquo;Pesado en la balanza y hallado falto&rdquo;
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[320px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Filtros
            filtros={filtros}
            setFiltros={setFiltros}
            departamentos={departamentos}
            modalidades={modalidades}
            total={datos.total}
          />
        </aside>

        <section className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Metrica etiqueta="Contratos" valor={datos.total.toLocaleString("es-CO")} />
            <Metrica etiqueta="P1 en pantalla" valor={String(p1)} acento />
            <Metrica etiqueta="Plata en riesgo" valor={cop(plataTotal)} acento />
          </div>

          {error && (
            <p className="rounded-lg border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-300">
              {error}
            </p>
          )}

          {fueraDeCorpus && (
            <div className="rounded-xl border border-sky-800 bg-sky-950/30 p-5">
              <h3 className="text-sm font-semibold text-sky-200">
                {busqueda} no está en el corpus
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Tiene forma de contrato de SECOP II. Se puede traer en vivo, correrle el motor
                de reglas y verificar al contratista en fuentes oficiales.
              </p>
              <div className="mt-4">
                <AnalisisEnVivo idContrato={busqueda} />
              </div>
            </div>
          )}

          {cargando && datos.contratos.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-500">Cargando contratos…</p>
          )}

          {!cargando && !fueraDeCorpus && datos.contratos.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-500">
              Ningún contrato coincide con estos filtros.
            </p>
          )}

          <div className="space-y-3">
            {datos.contratos.map((c) => (
              <TarjetaContrato key={c.id_contrato} c={c} />
            ))}
          </div>

          {datos.contratos.length > 0 && datos.total > datos.contratos.length && (
            <p className="py-4 text-center text-xs text-slate-500">
              Mostrando {datos.contratos.length} de {datos.total.toLocaleString("es-CO")}.
              Afina los filtros para ver más.
            </p>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-800 px-6 py-6">
        <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-slate-500">
          {AVISO_LEGAL} Datos de fuentes públicas (Ley 1712 de 2014).
        </p>
      </footer>
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  acento,
}: {
  etiqueta: string;
  valor: string;
  acento?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p
        className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
          acento ? "text-sky-300" : "text-slate-100"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}
