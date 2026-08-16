type Metrica = { label: string; value: string; sub?: string };

/** Degradados por posición: azul, violeta, cian, verde. */
const GRADIENTES = [
  "linear-gradient(120deg, #2563eb, #4f46e5)",
  "linear-gradient(120deg, #7c3aed, #a855f7)",
  "linear-gradient(120deg, #0ea5e9, #06b6d4)",
  "linear-gradient(120deg, #16a34a, #22c55e)",
];

export function MetricBand({ metrics }: { metrics: Metrica[] }) {
  return (
    <section
      aria-label="Indicadores del corpus"
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
    >
      {metrics.map((m, i) => (
        <div key={m.label} className="card-soft flex flex-col gap-1.5 px-5 py-6">
          <span
            className="num text-[34px] font-extrabold leading-none tabular-nums tracking-tight md:text-[40px]"
            style={{
              backgroundImage: GRADIENTES[i % GRADIENTES.length],
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {m.value}
          </span>
          <span className="text-sm font-semibold text-foreground">{m.label}</span>
          {m.sub && <span className="text-xs text-muted-foreground">{m.sub}</span>}
        </div>
      ))}
    </section>
  );
}
