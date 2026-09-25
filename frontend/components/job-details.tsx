"use client";

import Link from "next/link";
import { useAgentFetch } from "@/lib/use-agent-fetch";
import { useEffect, useState } from "react";
import { CalendarDays, LoaderCircle, MapPin, BriefcaseBusiness } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { Button } from "@/components/ui/button";
import { SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { compactDate, employmentLabel, externalUrl, parseJobDetail, type Job, type JobDetail } from "@/lib/job-model";

type Props = { job: Job; open: boolean; applying: boolean; applyError: string; onApply: () => void; onCloseAutoFocus: (event: Event) => void };

export function JobDetails({ job, open, applying, applyError, onApply, onCloseAutoFocus }: Props) {
  const agentFetch = useAgentFetch();
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open || detail) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await agentFetch(`/api/jobs/${job.id}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 404 ? "This job is no longer available." : "Couldn’t load the full description.");
        const result = parseJobDetail(await response.json());
        if (!result || result.id !== job.id) throw new Error("Couldn’t load the full description.");
        if (!controller.signal.aborted) setDetail(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Couldn’t load the full description.");
      }
    }
    void load();
    return () => controller.abort();
  }, [open, job.id, detail, attempt, agentFetch]);

  const current = detail ?? job;
  const originalUrl = externalUrl(current.url) ?? externalUrl(current.applyUrl);
  const date = compactDate(current.publishedAt ?? current.firstSeenAt);

  return (
    <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[38rem]" onCloseAutoFocus={onCloseAutoFocus}>
      <div className="flex h-12 shrink-0 items-center border-b px-6 text-xs font-medium text-muted-foreground">Job details</div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <SheetHeader className="gap-4 px-6 pt-7 pb-6 sm:px-8">
          <div className="flex items-center gap-2.5"><CompanyLogo company={current.company} domain={current.domain} sourceKey={current.sourceKey} /><span className="text-sm font-medium">{current.company}</span></div>
          <SheetTitle className="text-[23px] leading-snug font-semibold tracking-tight wrap-anywhere">{current.title}</SheetTitle>
          <SheetDescription className="sr-only">Role details and application options at {current.company}.</SheetDescription>
          <dl className="grid gap-3 text-[13px]">
            {current.location && <div className="flex items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><dt className="sr-only">Location</dt><dd className="wrap-anywhere">{current.location}</dd></div>}
            {(current.employmentType || current.isRemote) && <div className="flex items-center gap-2 text-muted-foreground"><BriefcaseBusiness className="size-4 shrink-0" aria-hidden="true" /><dt className="sr-only">Employment</dt><dd>{[current.employmentType && employmentLabel(current.employmentType), current.isRemote && "Remote"].filter(Boolean).join(" · ")}</dd></div>}
            {date && <div className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="size-4 shrink-0" aria-hidden="true" /><dt className="sr-only">{current.publishedAt ? "Posted" : "First seen"}</dt><dd>{current.publishedAt ? "Posted" : "First seen"} {date}</dd></div>}
          </dl>
        </SheetHeader>
        <section aria-label="Job description" className="border-t px-6 py-6 sm:px-8">
          <h3 className="mb-5 text-sm font-semibold">About this role</h3>
          {detail?.descriptionText ? (
            <div className="space-y-4 text-[13px] leading-7 text-foreground/85 wrap-anywhere">
              {detail.descriptionText.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index} className="whitespace-pre-line">{paragraph}</p>)}
            </div>
          ) : error ? (
            <div role="status" className="space-y-3 text-sm text-muted-foreground"><p>{error}</p><Button variant="outline" size="sm" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Try again</Button></div>
          ) : detail ? (
            <p className="text-sm leading-6 text-muted-foreground">The full description is available on the company’s original posting.</p>
          ) : (
            <div role="status" aria-label="Loading description" className="space-y-3"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /><Skeleton className="mt-6 h-3 w-full" /><Skeleton className="h-3 w-3/4" /></div>
          )}
        </section>
      </div>
      <SheetFooter className="shrink-0 gap-3 border-t bg-popover px-6 py-4 sm:px-8">
        {applyError && <div role="alert" className="text-sm"><p>{applyError}</p><Link href="/profile" className="underline underline-offset-4">Edit profile</Link></div>}
        <div className="flex items-center gap-3">
          {originalUrl && <Button asChild variant="outline" className="h-10 flex-1"><a href={originalUrl} target="_blank" rel="noopener noreferrer">Original posting</a></Button>}
          <Button className="h-10 flex-1" disabled={applying || !detail} onClick={onApply}>
            {applying && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{applying ? "Starting…" : "Apply"}
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">Uses your saved profile. Stops before submitting.</p>
      </SheetFooter>
    </SheetContent>
  );
}
