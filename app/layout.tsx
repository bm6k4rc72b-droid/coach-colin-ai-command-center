import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coach Colin · AI Command Center",
  description: "Private chat workspace and cinematic video studio in one console.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-obsidian text-ink">
        <div className="flex min-h-screen">
          <aside className="hidden w-60 shrink-0 flex-col border-r border-hairline bg-panel px-4 py-6 md:flex">
            <Link href="/" className="mb-1 block">
              <div
                className="text-[22px] leading-tight text-ink"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Coach Colin
              </div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-champagne-dim">
                Command Center
              </div>
            </Link>

            <div className="gold-rule my-5 h-px w-full" />

            <Nav />

            <div className="mt-auto pt-6 text-[11px] leading-relaxed text-ink-faint">
              Runs locally. Conversations and boards stay in this browser.
            </div>
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
