"use client";
import { useAgentFetch } from "@/lib/use-agent-fetch";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ApplicationSnapshot } from "@/components/application-snapshot";
import {
  ArrowUpRight,
  Check,
  CircleHelp,
  LoaderCircle,
  Monitor,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
type Run = {
  id: string;
  job: { title: string; company: string; url: string };
  status: string;
  message: string;
  liveUrl: string | null;
  screenshotAt: number | null;
  expiresAt: string;
  filled: string[];
  unanswered: string[];
  events: { at: string; message: string }[];
};
export function ApplicationSession() {
  const agentFetch = useAgentFetch();
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [view, setView] = useState<"live" | "snapshot">("live");
  const [loadedViewer, setLoadedViewer] = useState<string | null>(null);
  const [viewerUnavailable, setViewerUnavailable] = useState(false);
  const liveUrl = run?.liveUrl;
  useEffect(() => {
    if (!liveUrl || view !== "live" || loadedViewer === liveUrl) return;
    const timer = setTimeout(() => {
      setViewerUnavailable(true);
      setView("snapshot");
    }, 10000);
    return () => clearTimeout(timer);
  }, [liveUrl, view, loadedViewer]);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    const poll = async () => {
      controller = new AbortController();
      try {
        const response = await agentFetch("/api/agent/runs/current", {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        if (!response.ok) throw new Error();
        const data = await response.json() as Run | null;
        if (disposed) return;
        setRun(data);
        setError("");
        if (data && !["expired", "stopped", "failed"].includes(data.status))
          timer = setTimeout(poll, 1500);
      } catch {
        if (!disposed) {
          setError("Connection interrupted. Reconnecting…");
          timer = setTimeout(poll, 4000);
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [agentFetch]);
  async function stop() {
    setStopping(true);
    try {
      const response = await agentFetch("/api/agent/runs/stop", { method: "POST" });
      if (!response.ok) throw new Error();
      setRun(await response.json() as Run);
    } catch {
      setError("Couldn’t stop the session. Please try again.");
    } finally {
      setStopping(false);
    }
  }
  if (loading)
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Connecting to your application…
      </div>
    );
  if (!run)
    return (
      <div className="space-y-4 p-6">
        <p>{error || "Choose a job to start an application."}</p>
        <Button asChild>
          <Link href="/job-board">Go to Job Board</Link>
        </Button>
      </div>
    );
  const active = !["expired", "stopped", "failed"].includes(run.status);
  const running = ["queued", "opening", "filling"].includes(run.status);
  return (
    <div className="w-full space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
            <span
              className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground"}`}
            />
            {running
              ? "Agent is working"
              : run.status === "needs_attention"
                ? "Needs your review"
                : run.status === "review"
                  ? "Ready for review"
                  : "Session ended"}{" "}
            · Fill only
          </div>
          <h2 className="text-xl font-semibold">{run.job.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {run.job.company}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="h-10">
            <a href={run.job.url} target="_blank" rel="noreferrer noopener">Open original job<ArrowUpRight /></a>
          </Button>
          <Button variant="outline" asChild className="h-10">
            <Link href="/profile">Edit profile</Link>
          </Button>
          {active && (
            <Button
              variant="outline"
              className="h-10"
              onClick={() => void stop()}
              disabled={stopping}
            >
              <Square className="size-3" />
              Stop session
            </Button>
          )}
        </div>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {error || run.message}
      </p>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 overflow-hidden rounded-xl border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Monitor className="size-4" />
              Live browser
            </span>
            <div className="flex gap-2">
              {run.liveUrl && <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setLoadedViewer(null);
                  setViewerUnavailable(false);
                  setView(view === "live" ? "snapshot" : "live");
                }}
              >
                {view === "live" ? "Show snapshots" : "Show live view"}
              </Button>}
              {run.liveUrl && (
                <Button asChild variant="outline">
                  <a
                    href={run.liveUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Open live view
                    <ArrowUpRight />
                  </a>
                </Button>
              )}
            </div>
          </div>
          {viewerUnavailable && <p role="status" className="border-b px-4 py-3 text-sm text-muted-foreground">
            The embedded live view couldn’t connect. Showing the latest snapshot. Use Open live view to watch in a separate tab.
          </p>}
          <div className="min-h-[450px] bg-muted/20">
            {run.liveUrl && view === "live" ? (
              <iframe
                title="Read-only live application browser"
                src={run.liveUrl}
                referrerPolicy="no-referrer"
                onLoad={() => setLoadedViewer(run.liveUrl)}
                onError={() => { setViewerUnavailable(true); setView("snapshot"); }}
                className="h-[min(72vh,900px)] min-h-[450px] w-full border-0"
              />
            ) : run.screenshotAt ? (
              <ApplicationSnapshot timestamp={run.screenshotAt} />
            ) : (
              <div className="flex min-h-[450px] items-center justify-center gap-2 text-sm text-muted-foreground">
                {running ? <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Opening the application page…
                </> : <p className="max-w-md px-6 text-center">{active
                  ? "A browser preview is unavailable. Check the activity details or open the original job."
                  : "This session has ended. No browser preview was captured."}</p>}
              </div>
            )}
          </div>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Read-only view. Nothing will be submitted. The session closes
            automatically after five minutes. Snapshots show the last completed
            step.
          </p>
        </section>
        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border p-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Check className="size-4" />
              Filled ({run.filled.length})
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              {run.filled.map((field, index) => (
                <li key={index}>{field}</li>
              ))}
              {!run.filled.length && <li>{running ? "Waiting for field matches." : "No fields were filled."}</li>}
            </ul>
          </section>
          <section className="rounded-xl border p-4">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <CircleHelp className="size-4" />
              Needs review ({run.unanswered.length})
            </h3>
            <ul className="mt-3 max-h-80 space-y-3 overflow-auto text-xs leading-relaxed text-muted-foreground">
              {run.unanswered.map((field, index) => (
                <li key={index}>{field}</li>
              ))}
              {!run.unanswered.length && (
                <li>No unanswered questions recorded yet.</li>
              )}
            </ul>
          </section>
          <section className="rounded-xl border p-4">
            <h3 className="text-sm font-medium">Activity</h3>
            <ol className="mt-3 max-h-80 space-y-3 overflow-auto text-xs text-muted-foreground">
              {run.events
                .slice()
                .reverse()
                .map((event, index) => (
                  <li key={index}>{event.message}</li>
                ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
