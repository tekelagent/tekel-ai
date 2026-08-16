"use client";

import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/tekel/site-header";
import { SiteFooter } from "@/components/tekel/site-footer";
import { DashboardView } from "@/components/tekel/dashboard-view";
import { traerContratos, traerMetricas, type MetricasCorpus } from "@/lib/api";
import type { Contract } from "@/lib/types";

const CORPUS_LABEL = "Atlántico · 20.000 contratos";

export default function DashboardPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [patrones, setPatrones] = useState<Record<string, string[]>>({});
  const [metricas, setMetricas] = useState<MetricasCorpus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    // Se traen los contratos priorizados: son los que un equipo de control
    // abriría. El filtrado fino lo hace la vista en cliente, que es instantáneo.
    Promise.all([traerContratos({ limit: 100, orden: "plata" }), traerMetricas()])
      .then(([c, m]) => {
        if (!vivo) return;
        setContracts(c.contratos);
        setPatrones(c.patrones);
        setMetricas(m);
      })
      .catch((e) => vivo && setError((e as Error).message));
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader active="panel" corpus={CORPUS_LABEL} />
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-8 md:px-6">
        {error && (
          <p className="rounded-xl border border-crit/30 bg-crit-soft p-4 text-sm text-crit">
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
      </main>
      <SiteFooter catalogo="Catálogo normativo v2026-08-15" />
    </div>
  );
}
