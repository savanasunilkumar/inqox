"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { JobsPage } from "@/lib/job-model";

type Feed = JobsPage & { updatedAt: number };
type FeedCache = {
  feeds: Record<string, Feed>;
  savePage: (key: string, page: JobsPage, replace: boolean) => void;
};
const Context = createContext<FeedCache | null>(null);

// Lives in the shared layout: switching pages retains loaded jobs without a
// server round trip, but a browser refresh still gets fresh openings.
export function JobFeedProvider({ children }: { children: React.ReactNode }) {
  const [feeds, setFeeds] = useState<Record<string, Feed>>({});
  const savePage = useCallback((key: string, page: JobsPage, replace: boolean) => {
    const updatedAt = Date.now();
    setFeeds((current) => {
      const previous = replace ? [] : (current[key]?.items ?? []);
      const seen = new Set(previous.map((job) => job.id));
      const additions = page.items.filter((job) => {
        if (seen.has(job.id)) return false;
        seen.add(job.id);
        return true;
      });
      return { ...current, [key]: { ...page, items: [...previous, ...additions], updatedAt } };
    });
  }, []);
  const value = useMemo(() => ({ feeds, savePage }), [feeds, savePage]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useJobFeed() {
  const cache = useContext(Context);
  if (!cache) throw new Error("JobFeedProvider is required");
  return cache;
}
