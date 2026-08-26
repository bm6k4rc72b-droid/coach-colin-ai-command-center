import { mockProvider } from "./mock";
import { runwayProvider } from "./runway";
import type { Job, JobStatus, VideoProvider } from "./types";

const PROVIDERS: VideoProvider[] = [runwayProvider, mockProvider];

export function providerById(id: string): VideoProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** What the client shows in the provider picker. */
export function listProviders() {
  return PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    configured: p.isConfigured(),
  }));
}

/** The provider used when the client doesn't pin one. */
export function defaultProviderId(): string {
  return PROVIDERS.find((p) => p.isConfigured())?.id ?? mockProvider.id;
}

/**
 * In-memory job store. This is a local-first, single-operator tool, so jobs
 * live for the lifetime of the dev server; the browser keeps its own copy in
 * localStorage so a refresh doesn't lose the board. Swap this for Redis or
 * SQLite if you ever run more than one instance.
 */
const jobs = new Map<string, Job>();
const providerTaskIds = new Map<string, string>();

export function putJob(job: Job, providerTaskId: string) {
  jobs.set(job.id, job);
  providerTaskIds.set(job.id, providerTaskId);
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/** Poll the upstream provider and fold the result into the stored job. */
export async function refreshJob(id: string): Promise<Job | undefined> {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (job.status === "SUCCEEDED" || job.status === "FAILED") return job;

  const provider = providerById(job.provider);
  const providerTaskId = providerTaskIds.get(id);
  if (!provider || !providerTaskId) return job;

  try {
    const result = await provider.poll(providerTaskId);
    const next: Job = {
      ...job,
      status: result.status as JobStatus,
      progress: result.progress ?? job.progress,
      output: result.output ?? job.output,
      error: result.error ?? job.error,
      updatedAt: Date.now(),
    };
    jobs.set(id, next);
    return next;
  } catch (err) {
    const next: Job = {
      ...job,
      status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
      updatedAt: Date.now(),
    };
    jobs.set(id, next);
    return next;
  }
}

export type { Job, JobStatus } from "./types";
