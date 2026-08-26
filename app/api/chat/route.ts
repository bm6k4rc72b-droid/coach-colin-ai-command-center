import Anthropic from "@anthropic-ai/sdk";
import { personaById } from "@/lib/personas";

export const runtime = "nodejs";
// Streaming responses must not be statically cached.
export const dynamic = "force-dynamic";

const MODELS = new Set(["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"]);

type Body = {
  messages: Anthropic.MessageParam[];
  personaId?: string;
  model?: string;
  /** Surface Claude's reasoning summary in the UI. */
  showThinking?: boolean;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages must be a non-empty array" }, { status: 400 });
  }

  const persona = personaById(body.personaId);
  const model = body.model && MODELS.has(body.model) ? body.model : "claude-opus-5";

  const client = new Anthropic();

  const stream = client.messages.stream({
    model,
    max_tokens: 64000,
    system: [
      // Frozen prefix — cached across every turn of this persona.
      { type: "text", text: persona.system, cache_control: { type: "ephemeral" } },
    ],
    thinking: body.showThinking
      ? { type: "adaptive", display: "summarized" }
      : { type: "adaptive" },
    output_config: { effort: persona.effort },
    messages: body.messages,
  });

  const encoder = new TextEncoder();

  const sse = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              send("text", { text: event.delta.text });
            } else if (event.delta.type === "thinking_delta") {
              send("thinking", { text: event.delta.thinking });
            }
          }
        }

        const final = await stream.finalMessage();

        // A safety decline arrives as HTTP 200 with stop_reason "refusal".
        if (final.stop_reason === "refusal") {
          send("refusal", {
            category: final.stop_details?.type === "refusal" ? final.stop_details.category : null,
          });
        }

        send("done", {
          usage: {
            input: final.usage.input_tokens,
            output: final.usage.output_tokens,
            cacheRead: final.usage.cache_read_input_tokens ?? 0,
          },
          model: final.model,
        });
      } catch (err) {
        const raw = err instanceof Error ? err.message : "";
        // The SDK throws this before any request when no credential resolves.
        const noCredentials = raw.includes("Could not resolve authentication");

        const message = noCredentials
          ? "No Claude credentials found. Add ANTHROPIC_API_KEY to .env.local, then restart the server."
          : err instanceof Anthropic.RateLimitError
            ? "Rate limited by the Claude API — wait a moment and retry."
            : err instanceof Anthropic.AuthenticationError
              ? "Claude rejected the credentials. Check ANTHROPIC_API_KEY."
              : err instanceof Anthropic.APIConnectionError
                ? "Could not reach the Claude API. Check your network."
                : raw || "Unknown error";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
    cancel() {
      // The user navigated away or hit stop — don't keep paying for tokens.
      stream.abort();
    },
  });

  return new Response(sse, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
