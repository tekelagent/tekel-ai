"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/tekel/site-header";
import { SiteFooter } from "@/components/tekel/site-footer";
import { AnalisisEnVivo } from "@/app/components/AnalisisEnVivo";

/**
 * Análisis en vivo de un contrato que no está en el corpus.
 *
 * Se usa el componente real conectado a la máquina de estados, no el de v0,
 * que reproduce un log simulado. Aquí el log llega del servidor paso a paso.
 */
export default function AnalizarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const secopId = decodeURIComponent(id);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader corpus="Atlántico · 20.000 contratos" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver al tablero
        </Link>

        <section className="card-soft p-6">
          <p className="label-eyebrow">Fuera del corpus</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            {secopId}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Este contrato no está en el corpus precargado. Tekel lo trae en vivo de SECOP II,
            le corre el motor de reglas contra sus contratos hermanos y verifica al contratista
            en los registros oficiales.
          </p>
          <div className="mt-5">
            <AnalisisEnVivo idContrato={secopId} autoIniciar />
          </div>
          <p className="mt-4 border-t border-hairline pt-4 text-[12px] leading-relaxed text-muted-foreground">
            Cuando el análisis llegue al pliego, SECOP no permite descargarlo automáticamente
            —su página está protegida con reCAPTCHA— así que aparecerá un espacio para que
            subas el PDF y el análisis continúe solo.
          </p>
        </section>
      </main>
      <SiteFooter catalogo="Catálogo normativo v2026-08-15" />
    </div>
  );
}
