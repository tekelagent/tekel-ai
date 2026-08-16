"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SiteHeader } from "@/components/tekel/site-header";
import { SiteFooter } from "@/components/tekel/site-footer";
import { DashboardView } from "@/components/tekel/dashboard-view";
import { traerContratos, traerMetricas, type MetricasCorpus } from "@/lib/api";
import type { Contract } from "@/lib/types";

const CORPUS_LABEL = "Atlántico · 20.000 contratos";
/** Cada cuánto se revalida. Suficiente para que un análisis recién terminado
 *  aparezca solo, sin martillear la base. */
const REFRESCO_MS = 20_000;

export default function DashboardPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [patrones, setPatrones] = useState<Record<string, string[]>>({});
  const [metricas, setMetricas] = useState<MetricasCorpus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const vivo = useRef(true);

  const cargar = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([
        traerContratos({ limit: 120, orden: "plata" }),
        traerMetricas(),
      ]);
      if (!vivo.current) return;
      setContracts(c.contratos);
      setPatrones(c.patrones);
      setMetricas(m);
      setActualizado(new Date());
      setError(null);
    } catch (e) {
      if (vivo.current) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    void cargar();
    // Revalidación periódica: los análisis que terminan en segundo plano
    // aparecen sin que nadie recargue la página.
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, REFRESCO_MS);
    return () => {
      vivo.current = false;
      clearInterval(t);
    };
  }, [cargar]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader active="panel" corpus={CORPUS_LABEL} />
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-8 md:px-6">
        {error && (
          <p className="mb-6 rounded-xl border border-crit/30 bg-crit-soft p-4 text-sm text-crit">
            {error}
          </p>
        )}
        <DashboardView
          contracts={contracts}
          patronesByContract={patrones}
          metrics={
            metricas ?? {
              contratos_vigilados: 0,
              plata_en_riesgo_p1: 0,
              contratos_criticos: 0,
              hallazgos: 0,
            }
          }
        />
        {actualizado && (
          <p className="mt-8 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-ok" aria-hidden />
            Datos en vivo · actualizado{" "}
            {actualizado.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        )}
      </main>
      <SiteFooter catalogo="Catálogo normativo v2026-08-15" />
    </div>
  );
}
