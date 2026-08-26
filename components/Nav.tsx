"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Command", hint: "Overview" },
  { href: "/chat", label: "Chat", hint: "Personas & threads" },
  { href: "/studio", label: "Studio", hint: "Cinematic video" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`group rounded-lg px-3 py-2.5 transition-colors ${
              active ? "bg-panel-2 text-ink" : "text-ink-dim hover:bg-panel-2/60 hover:text-ink"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  active ? "bg-champagne" : "bg-hairline-2 group-hover:bg-champagne-dim"
                }`}
              />
              <span className="text-sm font-medium tracking-wide">{link.label}</span>
            </div>
            <div className="pl-[18px] text-[11px] text-ink-faint">{link.hint}</div>
          </Link>
        );
      })}
    </nav>
  );
}
