import Link from "next/link"
import { Scale } from "lucide-react"
import { cn } from "@/lib/utils"

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)}>
      <span className="icon-tile bg-brand-gradient relative size-9">
        <Scale className="size-5" strokeWidth={2} aria-hidden="true" />
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface bg-ok" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-bold tracking-tight text-foreground">Tekel</span>
        <span className="text-[10px] font-medium text-muted-foreground">Powered by AI</span>
      </span>
      <span className="sr-only">Tekel Agent — inicio</span>
    </Link>
  )
}

type SiteHeaderProps = {
  active?: "panel" | "ranking" | "metodologia"
  corpus?: string
}

export function SiteHeader({ active = "panel", corpus }: SiteHeaderProps) {
  const nav = [
    { key: "panel", label: "Panel", href: "/" },
    { key: "ranking", label: "Ranking", href: "/ranking" },
    { key: "metodologia", label: "Metodología", href: "/metodologia" },
  ] as const

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center gap-6 px-4 md:px-6">
        <Brand />
        <nav className="ml-2 flex items-center gap-1 text-sm" aria-label="Principal">
          {nav.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active === item.key ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-1.5 font-medium transition-colors duration-150",
                active === item.key
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {corpus && (
          <span className="badge-pill ml-auto hidden bg-brand-soft text-[var(--brand-via)] md:inline-flex">
            {corpus}
          </span>
        )}
      </div>
    </header>
  )
}
