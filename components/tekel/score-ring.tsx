import { cn } from "@/lib/utils"

type ScoreRingProps = {
  score: number | null
  color: string // hex o var()
  size?: number
  stroke?: number
  className?: string
  /** tamaño de fuente del número en px */
  fontSize?: number
}

/**
 * Anillo de score en SVG puro (sin librerías de charts).
 * El track es un círculo gris y el progreso se dibuja con stroke-dasharray.
 */
export function ScoreRing({
  score,
  color,
  size = 44,
  stroke = 4,
  className,
  fontSize,
}: ScoreRingProps) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100
  const dash = circumference * pct
  const fs = fontSize ?? Math.round(size * 0.34)

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth={stroke}
        />
        {score != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        )}
      </svg>
      <span
        className="num absolute font-semibold tabular-nums"
        style={{ fontSize: fs, color: score == null ? "var(--muted-foreground)" : "var(--foreground)" }}
      >
        {score == null ? "—" : score}
      </span>
    </div>
  )
}
