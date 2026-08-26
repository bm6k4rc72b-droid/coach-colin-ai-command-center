import { defaultProviderId, listProviders, providerById, putJob } from "@/lib/video";
import type { Job } from "@/lib/video/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The client calls this on load to populate the provider picker. */
export async function GET() {
  return Response.json({ providers: listProviders(), default: defaultProviderId() });
}

type Body = {
  shotId: string;
  prompt: string;
  ratio: string;
  duration: number;
  providerId?: string;
  promptImage?: string;
  seed?: number;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  if (!body.prompt?.trim()) {
    return Response.json({ error: "A shot needs a prompt before it can render" }, { status: 400 });
  }

  const providerId = body.providerId ?? defaultProviderId();
  const provider = providerById(providerId);
  if (!provider) {
    return Response.json({ error: `Unknown provider "${providerId}"` }, { status: 400 });
  }
  if (!provider.isConfigured()) {
    return Response.json(
      { error: `${provider.label} has no API key configured. Add it to .env.local.` },
      { status: 400 },
    );
  }

  const duration = Math.max(1, Math.min(30, Math.round(body.duration || 5)));

  try {
    const { providerTaskId } = await provider.start({
      shotId: body.shotId,
      prompt: body.prompt,
      ratio: body.ratio || "16:9",
      duration,
      promptImage: body.promptImage,
      seed: body.seed,
    });

    const now = Date.now();
    const job: Job = {
      id: crypto.randomUUID(),
      shotId: body.shotId,
      provider: providerId,
      prompt: body.prompt,
      ratio: body.ratio || "16:9",
      duration,
      status: "PENDING",
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };

    putJob(job, providerTaskId);
    return Response.json({ job });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Generation could not be started" },
      { status: 502 },
    );
  }
}
