export type JobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type JobOutput = {
  /**
   * "video" — a real MP4/WebM URL the <video> tag can play.
   * "preview" — a still or animated SVG stand-in produced by the mock provider.
   */
  kind: "video" | "preview";
  url: string;
  posterUrl?: string;
};

export type Job = {
  id: string;
  shotId: string;
  provider: string;
  prompt: string;
  ratio: string;
  duration: number;
  status: JobStatus;
  /** 0–100. Providers that don't report progress get a synthetic ramp. */
  progress: number;
  createdAt: number;
  updatedAt: number;
  output?: JobOutput;
  error?: string;
};

export type GenerateRequest = {
  shotId: string;
  prompt: string;
  ratio: string;
  duration: number;
  /** Optional start frame as a URL or data URI. */
  promptImage?: string;
  seed?: number;
};

export interface VideoProvider {
  readonly id: string;
  readonly label: string;
  /** False when the required API key is absent — the UI greys the provider out. */
  isConfigured(): boolean;
  /** Kick off generation. Returns the provider's own task id. */
  start(req: GenerateRequest): Promise<{ providerTaskId: string }>;
  /** Poll one task. */
  poll(
    providerTaskId: string,
  ): Promise<{ status: JobStatus; progress?: number; output?: JobOutput; error?: string }>;
}
