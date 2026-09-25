import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="w-full min-w-0 px-4 py-5 sm:px-5" aria-busy="true">
      <p role="status" className="sr-only">Loading jobs…</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <div key={index} className="min-h-56 rounded-xl border bg-card p-5">
            <div className="mb-4 flex items-center gap-2.5"><Skeleton className="size-10 rounded-lg" /><Skeleton className="h-3 w-24" /></div>
            <Skeleton className="mb-2 h-4 w-4/5" /><Skeleton className="mb-4 h-4 w-3/5" /><Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
