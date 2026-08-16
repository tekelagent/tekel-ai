"use client";

import { useEffect, useMemo, useState } from "react";
import { Scale, Search } from "lucide-react";
import { Filtros, FILTROS_VACIOS, type EstadoFiltros } from "./components/Filtros";
import { TarjetaContrato, type ContratoLista } from "./components/TarjetaContrato";
import { MetricBand } from "./components/MetricBand";
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

  // Las opciones de los selects salen de lo que hay en pantalla: sin llamada
  // extra y siempre coherentes con lo cargado.
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
  const criticos = datos.contratos.filter((c) => c.risk_level === "critico").length;

  const busqueda = debounced.q.trim();
  const fueraDeCorpus = !cargando && FORMA_SECOP.test(busqueda) && datos.contratos.length === 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-hairline bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-4">
          <span className="icon-tile bg-brand-gradient size-9">
            <Scale className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-none tracking-tight">
              Tekel<span className="text-gradient">Agent</span>
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Auditoría de contratación pública · SECOP II
            </p>
          </div>
          <p className="ml-auto hidden text-xs italic text-muted-foreground lg:block">
            &ldquo;Pesado en la balanza y hallado falto&rdquo;
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <MetricBand
          metrics={[
            { label: "Contratos auditados", value: datos.total.toLocaleString("es-CO") },
            { label: "Prioridad P1", value: String(p1), sub: "en esta vista" },
            { label: "Riesgo crítico", value: String(criticos), sub: "en esta vista" },
            { label: "Plata en riesgo", value: cop(plataTotal), sub: "suma de la vista" },
          ]}
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Filtros
              filtros={filtros}
              setFiltros={setFiltros}
              departamentos={departamentos}
              modalidades={modalidades}
              total={datos.total}
            />
          </aside>

          <section className="space-y-4">
            {error && (
              <p className="rounded-xl border border-crit/30 bg-crit-soft p-4 text-sm text-crit">
                {error}
              </p>
            )}

            {fueraDeCorpus && (
              <div className="card-soft p-5">
                <div className="flex items-start gap-3">
                  <span className="icon-tile bg-brand-gradient size-9 shrink-0">
                    <Search className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">
                      {busqueda} no está en el corpus
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Tiene forma de contrato de SECOP II. Se puede traer en vivo, correrle el
                      motor de reglas y verificar al contratista en fuentes oficiales.
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <AnalisisEnVivo idContrato={busqueda} />
                </div>
              </div>
            )}

            {cargando && datos.contratos.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Cargando contratos…
              </p>
            )}

            {!cargando && !fueraDeCorpus && datos.contratos.length === 0 && (
              <p className="card-soft py-12 text-center text-sm text-muted-foreground">
                Ningún contrato coincide con estos filtros.
              </p>
            )}

            <div className="space-y-3">
              {datos.contratos.map((c) => (
                <TarjetaContrato key={c.id_contrato} c={c} />
              ))}
            </div>

            {datos.contratos.length > 0 && datos.total > datos.contratos.length && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Mostrando {datos.contratos.length} de {datos.total.toLocaleString("es-CO")}. Afina
                los filtros para ver más.
              </p>
            )}
          </section>
        </div>
      </main>

      <footer className="border-t border-hairline px-6 py-6">
        <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-muted-foreground">
          {AVISO_LEGAL} Datos de fuentes públicas (Ley 1712 de 2014).
        </p>
      </footer>
    </div>
  );
}
