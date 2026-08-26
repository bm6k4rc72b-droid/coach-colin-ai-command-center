"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ASPECT_RATIOS,
  CAMERA_MOVES,
  GRADES,
  LENSES,
  LIGHTING,
  MOODS,
  SHOT_SIZES,
  composePrompt,
  emptyShot,
} from "@/lib/cinematic";
import type { Preset, ShotSpec } from "@/lib/cinematic";
import type { Job } from "@/lib/video/types";
import { load, save } from "@/lib/storage";

const SHOTS_KEY = "ccc.studio.shots.v1";
const RATIO_KEY = "ccc.studio.ratio.v1";

type ProviderInfo = { id: string; label: string; configured: boolean };

export default function StudioPage() {
  const [shots, setShots] = useState<ShotSpec[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ratio, setRatio] = useState<string>("16:9");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerId, setProviderId] = useState<string>("mock");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  // Hydrate after mount — localStorage isn't available during SSR.
  useEffect(() => {
    const storedShots = load<ShotSpec[]>(SHOTS_KEY, []);
    const initial = storedShots.length ? storedShots : [seedShot()];
    setShots(initial);
    setSelectedId(initial[0].id);
    setRatio(load<string>(RATIO_KEY, "16:9"));
  }, []);

  useEffect(() => {
    if (shots.length) save(SHOTS_KEY, shots);
  }, [shots]);
  useEffect(() => {
    save(RATIO_KEY, ratio);
  }, [ratio]);

  useEffect(() => {
    fetch("/api/studio/generate")
      .then((r) => r.json())
      .then((d: { providers: ProviderInfo[]; default: string }) => {
        setProviders(d.providers);
        setProviderId(d.default);
      })
      .catch(() => setNotice("Could not reach the studio API."));
  }, []);

  const selected = shots.find((s) => s.id === selectedId) ?? null;

  const patchShot = useCallback(
    (patch: Partial<ShotSpec>) => {
      setShots((prev) => prev.map((s) => (s.id === selectedId ? { ...s, ...patch } : s)));
    },
    [selectedId],
  );

  // Poll every unfinished job until it settles.
  const pending = jobs.some((j) => j.status === "PENDING" || j.status === "RUNNING");
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(async () => {
      const open = jobsRef.current.filter(
        (j) => j.status === "PENDING" || j.status === "RUNNING",
      );
      const updated = await Promise.all(
        open.map(async (j) => {
          try {
            const res = await fetch(`/api/studio/jobs/${j.id}`);
            if (!res.ok) return null;
            const { job } = (await res.json()) as { job: Job };
            return job;
          } catch {
            return null;
          }
        }),
      );
      const byId = new Map(
        updated.filter((j): j is Job => Boolean(j)).map((j) => [j.id, j]),
      );
      if (byId.size) setJobs((prev) => prev.map((j) => byId.get(j.id) ?? j));
    }, 2000);
    return () => clearInterval(timer);
  }, [pending]);

  async function renderShot(shot: ShotSpec) {
    const prompt = composePrompt(shot);
    if (!shot.subject.trim()) {
      setNotice("Describe what happens in the shot before rendering it.");
      return;
    }
    setNotice(null);

    try {
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shotId: shot.id,
          prompt,
          ratio,
          duration: shot.duration,
          providerId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? "Could not start the render.");
        return;
      }
      setJobs((prev) => [data.job as Job, ...prev]);
    } catch {
      setNotice("Could not reach the studio API.");
    }
  }

  async function renderAll() {
    for (const shot of shots) {
      if (shot.subject.trim()) await renderShot(shot);
    }
  }

  function addShot() {
    const shot = emptyShot();
    setShots((prev) => [...prev, shot]);
    setSelectedId(shot.id);
  }

  function removeShot(id: string) {
    setShots((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  }

  function moveShot(id: string, delta: number) {
    setShots((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const totalRuntime = shots.reduce((sum, s) => sum + s.duration, 0);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-hairline px-5 py-3">
        <div
          className="text-lg text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Cinematic Studio
        </div>

        <select
          value={ratio}
          onChange={(e) => setRatio(e.target.value)}
          aria-label="Aspect ratio"
          className="rounded-md border border-hairline-2 bg-panel px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-champagne-dim"
        >
          {ASPECT_RATIOS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>

        <select
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          aria-label="Render provider"
          className="rounded-md border border-hairline-2 bg-panel px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-champagne-dim"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.configured}>
              {p.label}
              {p.configured ? "" : " — no key"}
            </option>
          ))}
        </select>

        <span className="text-[12px] text-ink-faint">
          {shots.length} shots · {totalRuntime}s
        </span>

        <button
          onClick={() => void renderAll()}
          className="ml-auto rounded-lg bg-champagne px-4 py-1.5 text-sm font-medium text-obsidian transition-opacity hover:opacity-90"
        >
          Render all
        </button>
      </header>

      {notice && (
        <div className="border-b border-ember/30 bg-ember/10 px-5 py-2 text-[13px] text-ember">
          {notice}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Shot list */}
        <div className="hidden w-56 shrink-0 flex-col border-r border-hairline bg-panel/40 md:flex">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {shots.map((shot, i) => (
              <div
                key={shot.id}
                className={`group mb-1 rounded-lg px-3 py-2 ${
                  shot.id === selectedId ? "bg-panel-2" : "hover:bg-panel-2/60"
                }`}
              >
                <button
                  onClick={() => setSelectedId(shot.id)}
                  className="w-full text-left"
                >
                  <div className="text-[11px] uppercase tracking-[0.16em] text-champagne-dim">
                    Shot {i + 1}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink">
                    {shot.subject || <span className="text-ink-faint">Empty</span>}
                  </div>
                  <div className="mt-1 text-[11px] text-ink-faint">{shot.duration}s</div>
                </button>
                <div className="mt-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => moveShot(shot.id, -1)}
                    aria-label="Move up"
                    className="rounded px-1.5 text-[11px] text-ink-faint hover:text-champagne"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveShot(shot.id, 1)}
                    aria-label="Move down"
                    className="rounded px-1.5 text-[11px] text-ink-faint hover:text-champagne"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeShot(shot.id)}
                    aria-label="Delete shot"
                    className="ml-auto rounded px-1.5 text-[11px] text-ink-faint hover:text-ember"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3">
            <button
              onClick={addShot}
              className="w-full rounded-lg border border-hairline-2 px-3 py-2 text-sm text-ink-dim transition-colors hover:border-champagne-dim hover:text-champagne"
            >
              + Add shot
            </button>
          </div>
        </div>

        {/* Composer */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {selected ? (
            <div className="mx-auto max-w-2xl px-6 py-8">
              <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-champagne-dim">
                What happens in this shot
              </label>
              <textarea
                value={selected.subject}
                onChange={(e) => patchShot({ subject: e.target.value })}
                rows={3}
                placeholder="A woman in a tailored coat steps off a train onto an empty platform"
                className="w-full resize-y rounded-lg border border-hairline-2 bg-panel px-3.5 py-3 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-champagne-dim"
              />

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <PresetField
                  label="Framing"
                  options={SHOT_SIZES}
                  value={selected.shotSize}
                  onChange={(v) => patchShot({ shotSize: v })}
                />
                <PresetField
                  label="Camera move"
                  options={CAMERA_MOVES}
                  value={selected.cameraMove}
                  onChange={(v) => patchShot({ cameraMove: v })}
                />
                <PresetField
                  label="Lens"
                  options={LENSES}
                  value={selected.lens}
                  onChange={(v) => patchShot({ lens: v })}
                />
                <PresetField
                  label="Lighting"
                  options={LIGHTING}
                  value={selected.lighting}
                  onChange={(v) => patchShot({ lighting: v })}
                />
                <PresetField
                  label="Grade"
                  options={GRADES}
                  value={selected.grade}
                  onChange={(v) => patchShot({ grade: v })}
                />
                <PresetField
                  label="Mood"
                  options={MOODS}
                  value={selected.mood}
                  onChange={(v) => patchShot({ mood: v })}
                />
              </div>

              <div className="mt-6">
                <label className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-champagne-dim">
                  Duration — {selected.duration}s
                </label>
                <input
                  type="range"
                  min={2}
                  max={20}
                  step={1}
                  value={selected.duration}
                  onChange={(e) => patchShot({ duration: Number(e.target.value) })}
                  className="w-full accent-champagne"
                />
              </div>

              <div className="mt-8 rounded-lg border border-hairline bg-panel/60 p-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-champagne-dim">
                  Composed prompt
                </div>
                <p className="mt-2 font-mono text-[12.5px] leading-relaxed text-ink-dim">
                  {composePrompt(selected) || "—"}
                </p>
              </div>

              <button
                onClick={() => void renderShot(selected)}
                className="mt-5 rounded-lg bg-champagne px-5 py-2.5 text-sm font-medium text-obsidian transition-opacity hover:opacity-90"
              >
                Render this shot
              </button>
            </div>
          ) : (
            <div className="grid h-full place-items-center text-sm text-ink-faint">
              Add a shot to begin.
            </div>
          )}
        </div>

        {/* Render queue */}
        <div className="hidden w-72 shrink-0 flex-col border-l border-hairline bg-panel/40 xl:flex">
          <div className="border-b border-hairline px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-champagne-dim">
            Render queue
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {jobs.length === 0 && (
              <p className="px-1 text-[13px] leading-relaxed text-ink-faint">
                Nothing queued yet. Renders appear here and drop onto the timeline when they
                finish.
              </p>
            )}
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <Timeline shots={shots} jobs={jobs} />
    </div>
  );
}

function PresetField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Preset[];
  value?: string;
  onChange: (v: string) => void;
}) {
  const note = options.find((o) => o.id === value)?.note;
  return (
    <div>
      <label className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-champagne-dim">
        {label}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-hairline-2 bg-panel px-2.5 py-2 text-[13px] text-ink outline-none focus:border-champagne-dim"
      >
        <option value="">None</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {note && <p className="mt-1 text-[11px] text-ink-faint">{note}</p>}
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const done = job.status === "SUCCEEDED";
  const failed = job.status === "FAILED";

  return (
    <div className="mb-2 rounded-lg border border-hairline bg-panel p-2.5">
      {done && job.output ? (
        job.output.kind === "video" ? (
          <video
            src={job.output.url}
            poster={job.output.posterUrl}
            controls
            loop
            muted
            playsInline
            className="mb-2 w-full rounded"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={job.output.url} alt={job.prompt} className="mb-2 w-full rounded" />
        )
      ) : failed ? (
        <div className="mb-2 rounded bg-ember/10 px-2 py-3 text-[12px] leading-snug text-ember">
          {job.error ?? "Render failed"}
        </div>
      ) : (
        <div className="mb-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-hairline">
            <div
              className="h-full bg-champagne transition-all duration-500"
              style={{ width: `${Math.max(4, job.progress)}%` }}
            />
          </div>
          <div className="mt-1.5 text-[11px] text-ink-faint">
            {job.status.toLowerCase()} · {job.progress}%
          </div>
        </div>
      )}
      <p className="line-clamp-2 text-[12px] leading-snug text-ink-dim">{job.prompt}</p>
    </div>
  );
}

function Timeline({ shots, jobs }: { shots: ShotSpec[]; jobs: Job[] }) {
  // Each shot shows its most recent successful render.
  const latestByShot = new Map<string, Job>();
  for (const job of [...jobs].sort((a, b) => a.createdAt - b.createdAt)) {
    if (job.status === "SUCCEEDED") latestByShot.set(job.shotId, job);
  }

  const total = shots.reduce((sum, s) => sum + s.duration, 0) || 1;

  return (
    <div className="border-t border-hairline bg-panel/60 px-5 py-3">
      <div className="mb-2 flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-[0.18em] text-champagne-dim">
          Timeline
        </span>
        <span className="text-[11px] text-ink-faint">
          {latestByShot.size} of {shots.length} rendered · {total}s total
        </span>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {shots.map((shot, i) => {
          const job = latestByShot.get(shot.id);
          return (
            <div
              key={shot.id}
              // Width tracks duration, so the strip reads as real screen time.
              style={{ flexBasis: `${(shot.duration / total) * 100}%`, minWidth: 132 }}
              className="flex shrink-0 items-center gap-2 overflow-hidden rounded border border-hairline bg-panel px-1.5 py-1.5"
              title={shot.subject}
            >
              {/* Aspect-locked thumb, so a lone clip can't stretch the frame. */}
              <div className="h-10 w-[72px] shrink-0 overflow-hidden rounded-sm bg-obsidian">
                {job?.output ? (
                  job.output.kind === "video" ? (
                    <video src={job.output.url} muted loop className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={job.output.url}
                      alt={shot.subject}
                      className="h-full w-full object-cover"
                    />
                  )
                ) : (
                  <div className="grid h-full place-items-center text-[11px] text-ink-faint">
                    {i + 1}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] text-ink">
                  {shot.subject || `Shot ${i + 1}`}
                </div>
                <div className="text-[10px] text-ink-faint">
                  {shot.duration}s{job ? "" : " · not rendered"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A worked example so the studio isn't blank on first run. */
function seedShot(): ShotSpec {
  return {
    ...emptyShot(),
    subject: "A woman in a tailored camel coat steps off a night train onto an empty platform",
    duration: 6,
  };
}
