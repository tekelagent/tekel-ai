import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jbMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tekel Agent — Auditoría de contratación pública",
  description:
    "Indicadores de riesgo sobre contratación pública colombiana (SECOP II), " +
    "verificables en fuentes oficiales.",
};

// Se tipa explícitamente en vez de usar el LayoutProps global que Next genera
// en .next/types: ese tipo no existe antes del primer build, así que un
// typecheck en limpio o en CI fallaría.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${jbMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
