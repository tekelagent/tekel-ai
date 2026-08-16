import type { Metadata } from "next";
import { SiteHeader } from "@/components/tekel/site-header";
import { SiteFooter } from "@/components/tekel/site-footer";
import { MethodologyView } from "@/components/tekel/methodology-view";

export const metadata: Metadata = {
  title: "Metodología · Tekel",
  description:
    "Cómo Tekel calcula el score de riesgo de contratación pública: fuentes de datos, " +
    "patrones evaluados, ponderación y límites del análisis.",
};

export default function MethodologyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader active="metodologia" corpus="Atlántico · 20.000 contratos" />
      <main className="flex-1">
        <MethodologyView />
      </main>
      <SiteFooter catalogo="Catálogo normativo v2026-08-15" />
    </div>
  );
}
