"use client";

import { use, useCallback, useEffect, useState } from "react";
import { SiteHeader } from "@/components/tekel/site-header";
import { SiteFooter } from "@/components/tekel/site-footer";
import { DetailView } from "@/components/tekel/detail-view";
import { AnalisisEnVivo } from "@/app/components/AnalisisEnVivo";
import { aContract, aFinding } from "@/lib/api";
import type {
  AnalysisState,
  Contract,
  Finding,
  ForensicProfile,
  PliegoCita,
} from "@/lib/types";

/** El perfil que devuelve Croma → la forma que espera la UI. */
function aForensicProfile(f: any, consultadoEn: string): ForensicProfile | null {
  if (!f) return null;
  const e = f.rues?.entity ?? {};
  const checks: ForensicProfile["checks"] = [];

  const agregar = (nombre: string, dato: any, alerta: boolean, detalle: string) => {
    checks.push({
      nombre,
      resultado: dato === null || dato === undefined ? "omitido" : alerta ? "alerta" : "ok",
      detalle,
    });
  };

  agregar(
    "Responsabilidad fiscal (Contraloría)",
    f.contraloria,
    Boolean(f.contraloria?.is_fiscal_responsible),
    f.contraloria
      ? f.contraloria.is_fiscal_responsible
        ? "Figura en el Boletín de Responsables Fiscales"
        : "Sin responsabilidad fiscal vigente"
      : "No consultado",
  );
  agregar(
    "Antecedentes disciplinarios (Procuraduría)",
    f.procuraduria,
    Boolean(f.procuraduria?.has_records),
    f.procuraduria
      ? f.procuraduria.has_records
        ? `${(f.procuraduria.records ?? []).length} antecedente(s) registrados`
        : "Sin antecedentes disciplinarios"
      : "No consultado",
  );
  agregar(
    "Deudores morosos del Estado (Contaduría)",
    f.contaduria,
    Boolean(f.contaduria?.deudor_moroso || f.contaduria?.reported),
    f.contaduria
      ? f.contaduria.deudor_moroso || f.contaduria.reported
        ? "Reportado en el BDME"
        : "Sin reporte de morosidad"
      : "Se consulta en segundo plano: el endpoint es lento",
  );
  agregar(
    "Existencia y representación (RUES)",
    f.rues,
    f.rues?.found === false,
    f.rues?.found === false ? "No encontrado en RUES" : "Sociedad activa en RUES",
  );

  const contratos = f.contratos_proveedor;
  return {
    empresa: e.razon_social || e.name
      ? {
          razon_social: String(e.razon_social ?? e.name),
          nit: String(f.rues?.document_number ?? ""),
          fecha_constitucion: String(e.fecha_matricula ?? e.registration_date ?? ""),
          antiguedad_texto: "",
          representante: String(e.representante_legal ?? e.legal_representative ?? "—"),
          actividades: Array.isArray(e.ciiu) ? e.ciiu.map(String) : [],
        }
      : undefined,
    checks,
    contratos_previos: contratos
      ? {
          count: Number(contratos.count ?? (contratos.contracts ?? []).length),
          muestra: (contratos.contracts ?? []).slice(0, 3).map((x: any) => ({
            entidad: String(x.entity ?? x.entidad ?? "—"),
            valor: Number(x.value ?? x.valor ?? 0),
            fecha: String(x.signed_date ?? x.fecha ?? ""),
          })),
        }
      : undefined,
    sanciones_count: 0,
    consultado_en: consultadoEn,
  };
}

export default function DetalleContrato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const idContrato = decodeURIComponent(id);

  const [contract, setContract] = useState<Contract | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [forensic, setForensic] = useState<ForensicProfile | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [citas, setCitas] = useState<PliegoCita[]>([]);
  const [lineas, setLineas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/contracts/${encodeURIComponent(idContrato)}`);
    const j = await r.json();
    if (!r.ok) return setError(j.error ?? "No se pudo cargar el contrato");

    setContract(aContract(j.contrato));
    setFindings((j.expediente.hallazgos ?? []).map(aFinding));
    setLineas(j.expediente.lineas_de_verificacion ?? []);
    setForensic(
      aForensicProfile(j.capa_c?.forensic, j.capa_c?.actualizado ?? new Date().toISOString()),
    );
    setAnalysis(j.analisis ? { status: j.analisis.status, stage: j.analisis.stage, log: j.analisis.log } : null);
    setCitas(
      (j.capa_c?.pliego?.hallazgos ?? []).map((p: any) => ({
        archivo: String(p.archivo ?? "pliego"),
        pagina: Number(p.pagina ?? 1),
        cita: String(p.cita_textual ?? ""),
        hallazgo: String(p.hallazgo ?? ""),
        pattern_code: "PLIEGO_SASTRE",
      })),
    );
  }, [idContrato]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader active="panel" corpus="Atlántico · 20.000 contratos" />
      <main className="flex-1">
        {error && (
          <p className="mx-auto mt-8 max-w-3xl rounded-xl border border-crit/30 bg-crit-soft p-4 text-sm text-crit">
            {error}
          </p>
        )}
        {!error && !contract && (
          <p className="py-20 text-center text-sm text-muted-foreground">Cargando expediente…</p>
        )}
        {contract && (
          <DetailView
            contract={contract}
            findings={findings}
            forensic={forensic}
            analysis={analysis}
            citas={citas}
            otrosi={null}
            lineas={lineas}
            slotAnalisis={
              <section className="card-soft p-5">
                <h2 className="mb-2 text-sm font-semibold">Verificación forense del contratista</h2>
                <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                  Consulta RUES, Contraloría, Procuraduría y SECOP en vivo, y busca requisitos
                  restrictivos en el pliego.
                </p>
                <AnalisisEnVivo idContrato={idContrato} onTerminado={cargar} />
              </section>
            }
          />
        )}
      </main>
      <SiteFooter catalogo="Catálogo normativo v2026-08-15" />
    </div>
  );
}
