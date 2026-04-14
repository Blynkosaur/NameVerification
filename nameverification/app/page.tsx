"use client";

import { useState } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [targetName, setTargetName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTargetName(null);
    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Request failed (${res.status})`;
        setError(msg);
        return;
      }
      if (
        typeof data === "object" &&
        data !== null &&
        "targetName" in data &&
        typeof (data as { targetName: unknown }).targetName === "string"
      ) {
        setTargetName((data as { targetName: string }).targetName);
      } else {
        setError("Unexpected response from server.");
      }
    } catch {
      setError("Network error. Is the dev server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 px-6 py-16">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Target name generator
          </h1>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Describe the name you want. The model returns a single target name
            string.
          </p>
        </header>

        <form onSubmit={handleGenerate} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Prompt
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder='e.g. "Generate a random Arabic sounding name with Al and ibn, at most 5 words."'
              className="resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base font-normal text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-600"
              disabled={loading}
              required
            />
          </label>
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
        </form>

        {error ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {targetName !== null ? (
          <section className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Target name
            </h2>
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              {targetName}
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
