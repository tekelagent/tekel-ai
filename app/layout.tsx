import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
