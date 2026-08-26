export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Claude's summarized reasoning, when the thinking toggle is on. */
  thinking?: string;
  error?: string;
};

export type Thread = {
  id: string;
  title: string;
  personaId: string;
  model: string;
  messages: ChatMessage[];
  updatedAt: number;
};

export const MODEL_OPTIONS = [
  { id: "claude-opus-5", label: "Opus 5", hint: "Deepest reasoning" },
  { id: "claude-sonnet-5", label: "Sonnet 5", hint: "Balanced" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", hint: "Fastest" },
] as const;

export function newThread(personaId: string, model: string): Thread {
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    personaId,
    model,
    messages: [],
    updatedAt: Date.now(),
  };
}

/** Derive a thread title from its first user message. */
export function titleFrom(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > 44 ? `${clean.slice(0, 44)}…` : clean || "New conversation";
}
