"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PERSONAS, DEFAULT_PERSONA, personaById } from "@/lib/personas";
import { MODEL_OPTIONS, newThread, titleFrom } from "@/lib/chat-types";
import type { ChatMessage, Thread } from "@/lib/chat-types";
import { load, save } from "@/lib/storage";

const STORAGE_KEY = "ccc.chat.threads.v1";

export default function ChatPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showThinking, setShowThinking] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate from localStorage after mount so server and client markup match.
  useEffect(() => {
    const stored = load<Thread[]>(STORAGE_KEY, []);
    if (stored.length) {
      setThreads(stored);
      setActiveId(stored[0].id);
    } else {
      const first = newThread(DEFAULT_PERSONA.id, "claude-opus-5");
      setThreads([first]);
      setActiveId(first.id);
    }
  }, []);

  useEffect(() => {
    if (threads.length) save(STORAGE_KEY, threads);
  }, [threads]);

  const active = threads.find((t) => t.id === activeId) ?? null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length, streaming]);

  const patchActive = useCallback(
    (fn: (t: Thread) => Thread) => {
      setThreads((prev) => prev.map((t) => (t.id === activeId ? fn(t) : t)));
    },
    [activeId],
  );

  async function send() {
    const text = input.trim();
    if (!text || !active || streaming) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    // Build the wire history before we append the empty assistant turn.
    const history = [...active.messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    patchActive((t) => ({
      ...t,
      title: t.messages.length === 0 ? titleFrom(text) : t.title,
      messages: [...t.messages, userMsg, assistantMsg],
      updatedAt: Date.now(),
    }));
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const updateAssistant = (patch: Partial<ChatMessage>) => {
      patchActive((t) => ({
        ...t,
        messages: t.messages.map((m) => (m.id === assistantMsg.id ? { ...m, ...patch } : m)),
        updatedAt: Date.now(),
      }));
    };

    let text_ = "";
    let thinking_ = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          personaId: active.personaId,
          model: active.model,
          showThinking,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(detail.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7);
          const data = JSON.parse(dataLine.slice(6));

          if (event === "text") {
            text_ += data.text;
            updateAssistant({ content: text_ });
          } else if (event === "thinking") {
            thinking_ += data.text;
            updateAssistant({ thinking: thinking_ });
          } else if (event === "refusal") {
            updateAssistant({
              error: `Claude declined this request${data.category ? ` (${data.category})` : ""}.`,
            });
          } else if (event === "error") {
            updateAssistant({ error: data.message });
          }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        updateAssistant({ error: err instanceof Error ? err.message : "Something went wrong" });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  function createThread() {
    const t = newThread(active?.personaId ?? DEFAULT_PERSONA.id, active?.model ?? "claude-opus-5");
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
  }

  function deleteThread(id: string) {
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? null);
      return next.length ? next : [newThread(DEFAULT_PERSONA.id, "claude-opus-5")];
    });
  }

  const persona = personaById(active?.personaId);

  return (
    <div className="flex h-screen">
      {/* Thread rail */}
      <div className="hidden w-64 shrink-0 flex-col border-r border-hairline bg-panel/40 lg:flex">
        <div className="p-4">
          <button
            onClick={createThread}
            className="w-full rounded-lg border border-hairline-2 px-3 py-2 text-sm text-ink-dim transition-colors hover:border-champagne-dim hover:text-champagne"
          >
            + New conversation
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {threads.map((t) => (
            <div
              key={t.id}
              className={`group mb-0.5 flex items-center gap-1 rounded-lg px-3 py-2 ${
                t.id === activeId ? "bg-panel-2" : "hover:bg-panel-2/60"
              }`}
            >
              <button
                onClick={() => setActiveId(t.id)}
                className="min-w-0 flex-1 text-left"
                title={t.title}
              >
                <div className="truncate text-[13px] text-ink">{t.title}</div>
                <div className="text-[11px] text-ink-faint">{personaById(t.personaId).name}</div>
              </button>
              <button
                onClick={() => deleteThread(t.id)}
                aria-label={`Delete ${t.title}`}
                className="shrink-0 px-1 text-ink-faint opacity-0 transition-opacity hover:text-ember group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-hairline px-5 py-3">
          <select
            value={active?.personaId ?? DEFAULT_PERSONA.id}
            onChange={(e) => patchActive((t) => ({ ...t, personaId: e.target.value }))}
            aria-label="Persona"
            className="rounded-md border border-hairline-2 bg-panel px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-champagne-dim"
          >
            {PERSONAS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={active?.model ?? "claude-opus-5"}
            onChange={(e) => patchActive((t) => ({ ...t, model: e.target.value }))}
            aria-label="Model"
            className="rounded-md border border-hairline-2 bg-panel px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-champagne-dim"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-dim">
            <input
              type="checkbox"
              checked={showThinking}
              onChange={(e) => setShowThinking(e.target.checked)}
              className="accent-champagne"
            />
            Show reasoning
          </label>

          <span className="ml-auto hidden text-[12px] text-ink-faint sm:block">
            {persona.tagline}
          </span>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-5 py-8">
            {!active?.messages.length && (
              <div className="mt-24 text-center">
                <div
                  className="text-3xl text-ink-dim"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {persona.name}
                </div>
                <p className="mx-auto mt-3 max-w-sm text-sm text-ink-faint">{persona.tagline}</p>
              </div>
            )}

            {active?.messages.map((m, i) => (
              <Bubble
                key={m.id}
                message={m}
                streaming={streaming && i === active.messages.length - 1}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-hairline px-5 py-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={`Message ${persona.name}…`}
              className="max-h-48 min-h-[44px] flex-1 resize-y rounded-lg border border-hairline-2 bg-panel px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-champagne-dim"
            />
            {streaming ? (
              <button
                onClick={stop}
                className="h-[44px] shrink-0 rounded-lg border border-ember/60 px-4 text-sm text-ember transition-colors hover:bg-ember/10"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={() => void send()}
                disabled={!input.trim()}
                className="h-[44px] shrink-0 rounded-lg bg-champagne px-5 text-sm font-medium text-obsidian transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const isUser = message.role === "user";
  const pending = !isUser && streaming && !message.content && !message.error;

  return (
    <div className={`mb-7 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
        {!isUser && message.thinking && (
          <details className="mb-2 rounded-lg border border-hairline bg-panel/60 px-3 py-2">
            <summary className="cursor-pointer text-[11px] uppercase tracking-[0.16em] text-champagne-dim">
              Reasoning
            </summary>
            <div className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-dim">
              {message.thinking}
            </div>
          </details>
        )}

        {message.error ? (
          <div className="rounded-lg border border-ember/40 bg-ember/10 px-3.5 py-2.5 text-sm text-ember">
            {message.error}
          </div>
        ) : pending ? (
          <div className="h-4 w-24 rounded shimmer" />
        ) : (
          <div
            className={
              isUser
                ? "rounded-2xl rounded-br-sm bg-panel-2 px-4 py-2.5 text-[15px] leading-relaxed text-ink"
                : `text-[15px] leading-[1.75] text-ink whitespace-pre-wrap ${
                    streaming && !message.content.endsWith("\n") ? "caret" : ""
                  }`
            }
          >
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}
