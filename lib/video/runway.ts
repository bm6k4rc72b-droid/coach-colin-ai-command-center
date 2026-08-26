import type { GenerateRequest, JobStatus, JobOutput, VideoProvider } from "./types";

/**
 * Runway Gen-4 adapter.
 *
 * Verified from Runway's public docs: the REST base is
 * https://api.dev.runwayml.com/v1, every request carries a dated
 * `X-Runway-Version` header, generation is asynchronous (POST returns a task
 * id), and `GET /v1/tasks/{id}` reports PENDING | RUNNING | SUCCEEDED | FAILED.
 *
 * NOTE: the exact request *body* field names below follow Runway's published
 * SDK conventions but could not be re-verified against docs.dev.runwayml.com
 * from the machine this was written on (egress blocked). If a call 400s,
 * check the body shape against the current API reference first — the
 * endpoints, headers, and polling contract are correct.
 */
const BASE = process.env.RUNWAY_BASE_URL ?? "https://api.dev.runwayml.com/v1";
const VERSION = process.env.RUNWAY_API_VERSION ?? "2024-11-06";
const MODEL = process.env.RUNWAY_MODEL ?? "gen4_turbo";

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.RUNWAY_API_KEY ?? ""}`,
    "Content-Type": "application/json",
    "X-Runway-Version": VERSION,
  };
}

/** Runway Gen-4 video generation starts from an image, so text-only shots
 *  get a start frame generated first via text_to_image. */
async function generateStartFrame(prompt: string, ratio: string): Promise<string> {
  const res = await fetch(`${BASE}/text_to_image`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: process.env.RUNWAY_IMAGE_MODEL ?? "gen4_image",
      promptText: prompt,
      ratio,
    }),
  });

  if (!res.ok) {
    throw new Error(`text_to_image failed (${res.status}): ${await res.text()}`);
  }

  const { id } = (await res.json()) as { id: string };

  // Poll the image task to completion — we need its URL as the video's first frame.
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const task = await fetchTask(id);
    if (task.status === "SUCCEEDED") {
      const url = firstOutputUrl(task);
      if (!url) throw new Error("text_to_image succeeded with no output URL");
      return url;
    }
    if (task.status === "FAILED") {
      throw new Error(task.failure ?? "text_to_image task failed");
    }
  }
  throw new Error("text_to_image timed out after 2 minutes");
}

type RunwayTask = {
  id: string;
  status: JobStatus;
  progress?: number;
  output?: string[] | { url?: string }[];
  failure?: string;
};

async function fetchTask(id: string): Promise<RunwayTask> {
  const res = await fetch(`${BASE}/tasks/${id}`, { headers: headers() });
  if (!res.ok) throw new Error(`tasks/${id} failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as RunwayTask;
}

/** Runway has returned outputs as both a string[] and an object[]; handle both. */
function firstOutputUrl(task: RunwayTask): string | undefined {
  const first = task.output?.[0];
  if (!first) return undefined;
  return typeof first === "string" ? first : first.url;
}

export const runwayProvider: VideoProvider = {
  id: "runway",
  label: "Runway Gen-4",

  isConfigured() {
    return Boolean(process.env.RUNWAY_API_KEY);
  },

  async start(req: GenerateRequest) {
    const promptImage = req.promptImage ?? (await generateStartFrame(req.prompt, req.ratio));

    const res = await fetch(`${BASE}/image_to_video`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: MODEL,
        promptImage,
        promptText: req.prompt,
        ratio: req.ratio,
        duration: req.duration,
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`image_to_video failed (${res.status}): ${await res.text()}`);
    }

    const { id } = (await res.json()) as { id: string };
    return { providerTaskId: id };
  },

  async poll(providerTaskId) {
    const task = await fetchTask(providerTaskId);

    if (task.status === "SUCCEEDED") {
      const url = firstOutputUrl(task);
      if (!url) return { status: "FAILED" as JobStatus, error: "Succeeded with no output URL" };
      const output: JobOutput = { kind: "video", url };
      return { status: "SUCCEEDED" as JobStatus, progress: 100, output };
    }

    if (task.status === "FAILED") {
      return { status: "FAILED" as JobStatus, error: task.failure ?? "Generation failed" };
    }

    return {
      status: task.status,
      progress: typeof task.progress === "number" ? Math.round(task.progress * 100) : undefined,
    };
  },
};
