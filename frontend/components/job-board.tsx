"use client";
import { useAgentFetch } from "@/lib/use-agent-fetch";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, LoaderCircle, MapPin } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { JobDetails } from "@/components/job-details";
import { useJobFeed } from "@/components/job-feed-provider";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { employmentLabel, parseJobsPage, relativeDate, type Job } from "@/lib/job-model";
import Loading from "@/app/job-board/loading";

export function JobBoard() {
  const params = useSearchParams();
  const rawCursor = params.get("before") ?? "";
  const before = /^[1-9]\d*$/.test(rawCursor) && Number.isSafeInteger(Number(rawCursor)) ? Number(rawCursor) : null;
  return <JobFeed key={before ?? "latest"} before={before} />;
}

function JobFeed({ before }: { before: number | null }) {
  const agentFetch = useAgentFetch();
  const router = useRouter();
  const { feeds, savePage } = useJobFeed();
  const [applying, setApplying] = useState<number | null>(null);
  const [applyError, setApplyError] = useState<{ jobId: number; message: string } | null>(null);
  const applicationStarting = useRef(false);

  async function apply(jobId: number) {
    if (applicationStarting.current) return;
    applicationStarting.current = true;
    setApplying(jobId);
    setApplyError(null);
    try {
      const response = await agentFetch("/api/agent/runs/start", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Couldn’t start this application.");
      router.push("/application");
    } catch (failure) {
      setApplyError({ jobId, message: failure instanceof Error ? failure.message : "Couldn’t start this application." });
      applicationStarting.current = false;
      setApplying(null);
    }
  }
  const feedKey = String(before ?? "latest");
  const cached = feeds[feedKey];
  const jobs = cached?.items ?? [];
  const hasMore = cached?.hasMore ?? true;
  const cursor = cached ? cached.nextCursor : before;
  const [status, setStatus] = useState<"idle" | "loading" | "error">(cached ? "idle" : "loading");
  const [selected, setSelected] = useState<Job | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async (refresh = false) => {
    if (request.current || (!refresh && !hasMore)) return;
    const controller = new AbortController();
    request.current = controller;
    const nextCursor = refresh ? before : cursor;
    const query = nextCursor === null ? "" : `?before=${nextCursor}`;
    try {
      const response = await agentFetch(`/api/jobs${query}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Jobs unavailable");
      const page = parseJobsPage(await response.json());
      if (!page || (page.hasMore && nextCursor !== null && page.nextCursor! >= nextCursor)) throw new Error("Invalid job page");
      if (controller.signal.aborted) return;
      savePage(feedKey, page, refresh);
      setStatus("idle");
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [before, cursor, feedKey, hasMore, savePage, agentFetch]);

  const startLoad = useCallback((refresh = false) => {
    if (request.current || (!refresh && !hasMore)) return;
    setStatus("loading");
    void loadMore(refresh);
  }, [hasMore, loadMore]);

  useEffect(() => {
    // Cancel only this mount's request; Strict Mode can immediately remount.
    return () => { request.current?.abort(); request.current = null; };
  }, []);
  useEffect(() => {
    // loadMore only updates state after its network request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!cached) void loadMore();
  }, [cached, loadMore]);
  useEffect(() => {
    if (!hasMore || status !== "idle" || !sentinel.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) startLoad();
    }, { root: document.getElementById("page-scroll"), rootMargin: "400px 0px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, status, startLoad]);

  if (!cached && status !== "error") return <Loading />;

  return (
    <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
      <div className="w-full min-w-0 px-4 py-5 sm:px-5">
        {jobs.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-6 text-center" role="status">
            <BriefcaseBusiness className="size-6 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-medium">{status === "error" ? "We couldn’t load the jobs" : "No open roles right now"}</h2>
            <p className="text-sm text-muted-foreground">{status === "error" ? "Please try again in a moment." : "Check back soon for new opportunities."}</p>
            {status === "error" && <Button variant="outline" onClick={() => startLoad()}>Try again</Button>}
          </div>
        ) : (
          <section aria-label="Open jobs" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3">
            {jobs.map((job) => {
              const posted = relativeDate(job.publishedAt ?? job.firstSeenAt, cached?.updatedAt);
              return (
                <article key={job.id} data-job-id={job.id} data-selected={panelOpen && selected?.id === job.id} className="group relative flex min-h-56 min-w-0 flex-col rounded-xl border bg-card p-5 text-left transition-[border-color,box-shadow] duration-150 hover:border-primary/35 hover:shadow-sm data-[selected=true]:border-primary/50 motion-reduce:transition-none">
                  <button
                    type="button"
                    aria-label={`View ${job.title} at ${job.company}`}
                    aria-haspopup="dialog"
                    aria-expanded={panelOpen && selected?.id === job.id}
                    onClick={(event) => { selectedButton.current = event.currentTarget; setSelected(job); setPanelOpen(true); }}
                    className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  />
                    <span className="mb-4 flex w-full min-w-0 items-center gap-2.5">
                      <CompanyLogo company={job.company} domain={job.domain} sourceKey={job.sourceKey} />
                      <span className="min-w-0 text-[13px] font-medium text-muted-foreground wrap-anywhere">{job.company}</span>
                    </span>
                    <span className="mb-2.5 text-[15px] leading-snug font-semibold tracking-[-0.015em] text-foreground wrap-anywhere">{job.title}</span>
                    {job.location && <span className="mb-5 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground"><MapPin className="mt-1 size-3 shrink-0" aria-hidden="true" /><span className="line-clamp-2 wrap-anywhere">{job.location}</span></span>}
                    <span className="flex flex-wrap gap-1.5 text-[11px]">
                        {job.isRemote && <span className="rounded-md bg-primary/8 px-2 py-1 text-primary">Remote</span>}
                        {job.employmentType && <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{employmentLabel(job.employmentType)}</span>}
                    </span>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                      <span className="text-[11px] text-muted-foreground">{posted && <><span className="sr-only">{job.publishedAt ? "Posted " : "First seen "}</span>{posted}</>}</span>
                      <div className="relative z-20">
                        <Button type="button" size="sm" className="h-8 rounded-lg px-4" disabled={applying !== null}
                          aria-label={`Apply for ${job.title} at ${job.company}`}
                          onClick={(event) => { event.stopPropagation(); void apply(job.id); }}>
                          {applying === job.id && <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                          {applying === job.id ? "Starting…" : "Apply"}
                        </Button>
                      </div>
                    </div>
                    {applyError?.jobId === job.id && <p role="alert" className="mt-3 text-xs text-destructive">{applyError.message}</p>}
                </article>
              );
            })}
          </section>
        )}
        {jobs.length > 0 && (
          <div ref={sentinel} className="mt-5 flex min-h-16 flex-wrap items-center justify-center gap-3">
            {hasMore ? <Button variant="ghost" disabled={status === "loading"} onClick={() => startLoad()}>
              {status === "loading" && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {status === "error" ? "Try again" : status === "loading" ? "Loading more jobs…" : "Load more jobs"}
            </Button> : <p className="text-xs text-muted-foreground">You’re all caught up.</p>}
            {status === "error" && <p role="status" className="text-xs text-muted-foreground">Couldn’t load jobs. Your current results are still here.</p>}
          </div>
        )}
      </div>
      {selected && <JobDetails key={selected.id} job={selected} open={panelOpen} applying={applying !== null} applyError={applyError?.jobId === selected.id ? applyError.message : ""} onApply={() => void apply(selected.id)} onCloseAutoFocus={(event) => { event.preventDefault(); selectedButton.current?.focus({ preventScroll: true }); }} />}
    </Sheet>
  );
}
