import { refreshJob } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await refreshJob(id);

  if (!job) {
    return Response.json({ error: "No such job" }, { status: 404 });
  }
  return Response.json({ job });
}
