import Link from "next/link";
import { PERSONAS } from "@/lib/personas";
import { CAMERA_MOVES, LENSES, LIGHTING } from "@/lib/cinematic";

const MODULES = [
  {
    href: "/chat",
    name: "Chat",
    blurb:
      "Streaming conversations with five tuned personas, threaded history, and model switching. Everything a ChatGPT window does, in your own console.",
    stats: [`${PERSONAS.length} personas`, "3 models", "Streaming"],
  },
  {
    href: "/studio",
    name: "Cinematic Studio",
    blurb:
      "Build a shot list, compose each frame from real cinematography presets, queue the renders, and sequence the results on a timeline.",
    stats: [
      `${CAMERA_MOVES.length} camera moves`,
      `${LENSES.length} lenses`,
      `${LIGHTING.length} lighting setups`,
    ],
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 md:px-12 md:py-24">
      <p className="text-[11px] uppercase tracking-[0.28em] text-champagne-dim">
        Private workspace
      </p>
      <h1
        className="mt-4 text-5xl leading-[1.05] text-ink md:text-6xl"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Two rooms,
        <br />
        one console.
      </h1>
      <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-dim">
        A chat workspace for thinking, and a cinematic studio for making. Both run on your
        machine, against your own API keys.
      </p>

      <div className="gold-rule my-12 h-px w-full" />

      <div className="grid gap-4 md:grid-cols-2">
        {MODULES.map((mod) => (
          <Link
            key={mod.href}
            href={mod.href}
            className="group rounded-xl border border-hairline bg-panel p-6 transition-colors hover:border-champagne-dim/50 hover:bg-panel-2"
          >
            <h2
              className="text-2xl text-ink transition-colors group-hover:text-champagne"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {mod.name}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-dim">{mod.blurb}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {mod.stats.map((stat) => (
                <span
                  key={stat}
                  className="rounded-full border border-hairline-2 px-2.5 py-1 text-[11px] text-ink-faint"
                >
                  {stat}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-hairline bg-panel/50 p-6">
        <h3 className="text-sm font-medium text-ink">Before your first render</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Chat needs <code className="text-champagne-dim">ANTHROPIC_API_KEY</code>. The Studio
          works immediately in preview mode with no key at all — add{" "}
          <code className="text-champagne-dim">RUNWAY_API_KEY</code> to{" "}
          <code className="text-champagne-dim">.env.local</code> when you want real footage.
        </p>
      </div>
    </div>
  );
}
