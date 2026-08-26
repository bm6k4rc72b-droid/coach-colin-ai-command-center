import type { GenerateRequest, JobStatus, JobOutput, VideoProvider } from "./types";

/**
 * The mock provider exists so the entire Studio is usable — queue, timeline,
 * storyboard, export — with no API keys at all. It renders each shot as an
 * animated SVG "slate" derived from the prompt, on a realistic async delay.
 */
type MockTask = { startedAt: number; req: GenerateRequest; lifetimeMs: number };

const tasks = new Map<string, MockTask>();

/** Deterministic hue from the prompt so a given shot keeps a stable look. */
function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function dimsFor(ratio: string): { w: number; h: number } {
  const [rw, rh] = ratio.split(":").map(Number);
  if (!rw || !rh) return { w: 1280, h: 720 };
  const scale = 720 / Math.min(rw, rh);
  return { w: Math.round(rw * scale), h: Math.round(rh * scale) };
}

function slateSvg(req: GenerateRequest): string {
  const { w, h } = dimsFor(req.ratio);
  const hue = hueOf(req.prompt);
  const hue2 = (hue + 40) % 360;

  // Wrap the prompt onto lines that fit the frame.
  const words = req.prompt.split(/\s+/);
  const perLine = Math.max(3, Math.floor(w / 26));
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if ((cur + " " + word).trim().length > perLine) {
      lines.push(cur.trim());
      cur = word;
    } else {
      cur += " " + word;
    }
    if (lines.length >= 5) break;
  }
  if (cur.trim() && lines.length < 5) lines.push(cur.trim());

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const text = lines
    .map(
      (line, i) =>
        `<text x="${w / 2}" y="${h / 2 - (lines.length - 1) * 18 + i * 36}" ` +
        `text-anchor="middle" font-family="Georgia, serif" font-size="26" ` +
        `fill="rgba(255,255,255,0.92)">${esc(line)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 45% 16%)"/>
      <stop offset="100%" stop-color="hsl(${hue2} 55% 8%)"/>
    </linearGradient>
    <radialGradient id="v" cx="50%" cy="50%" r="75%">
      <stop offset="55%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.7)"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <circle cx="${w * 0.3}" cy="${h * 0.35}" r="${h * 0.28}" fill="hsl(${hue} 70% 55% / 0.18)">
    <animate attributeName="cx" values="${w * 0.3};${w * 0.7};${w * 0.3}" dur="${req.duration * 2}s" repeatCount="indefinite"/>
  </circle>
  <rect width="${w}" height="${h}" fill="url(#v)"/>
  ${text}
  <text x="24" y="${h - 24}" font-family="ui-monospace, monospace" font-size="16"
        fill="rgba(216,185,129,0.85)">PREVIEW · ${esc(req.ratio)} · ${req.duration}s</text>
</svg>`;
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const mockProvider: VideoProvider = {
  id: "mock",
  label: "Preview (no API key)",

  isConfigured() {
    return true;
  },

  async start(req) {
    const id = `mock_${crypto.randomUUID()}`;
    // Scale the fake render time with duration, so longer shots feel heavier.
    tasks.set(id, { startedAt: Date.now(), req, lifetimeMs: 2500 + req.duration * 600 });
    return { providerTaskId: id };
  },

  async poll(providerTaskId) {
    const task = tasks.get(providerTaskId);
    if (!task) return { status: "FAILED" as JobStatus, error: "Unknown task id" };

    const elapsed = Date.now() - task.startedAt;
    if (elapsed >= task.lifetimeMs) {
      const output: JobOutput = { kind: "preview", url: toDataUri(slateSvg(task.req)) };
      return { status: "SUCCEEDED" as JobStatus, progress: 100, output };
    }
    return {
      status: "RUNNING" as JobStatus,
      progress: Math.min(97, Math.round((elapsed / task.lifetimeMs) * 100)),
    };
  },
};
