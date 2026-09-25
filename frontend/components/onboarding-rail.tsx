"use client";

import { Progress } from "@/components/ui/progress";

export type RailItem = {
  id: string;
  label: string;
  done: boolean;
  fraction: number;
  left?: number;
  locked?: boolean;
};

export function StepStatus({ done, fraction, active }: { done: boolean; fraction: number; active: boolean }) {
  if (done) {
    return (
      <svg viewBox="0 0 14 14" className="size-3.5 shrink-0 text-primary" aria-hidden="true">
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path d="M4.2 7.2 6 9l3.8-3.8" fill="none" stroke="var(--background)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const r = 3.5;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 14 14" className={`size-3.5 shrink-0 ${active ? "text-foreground" : "text-muted-foreground"}`} aria-hidden="true">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={fraction > 0 ? 1 : 0.6} strokeDasharray={fraction > 0 ? undefined : "2 1.6"} />
      {fraction > 0 && (
        <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeWidth={r * 2} strokeDasharray={`${c * fraction} ${c}`} transform="rotate(-90 7 7)" />
      )}
    </svg>
  );
}

export function OnboardingShell({ items, activeId, onSelect, completed, total, header, footer, scrollRef, children }: {
  items: RailItem[];
  header: React.ReactNode;
  footer?: React.ReactNode;
  scrollRef?: React.Ref<HTMLDivElement>;
  activeId: string;
  onSelect?: (id: string) => void;
  completed: number;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <aside className="min-w-0 border-b lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="px-4 pt-5 pb-3 lg:px-3 lg:py-8">
          <div className="px-2">
            <p className="text-[13px] font-medium">Profile setup</p>
            <div className="mt-2.5 flex items-center gap-3">
              <Progress value={(completed / total) * 100} aria-label="Required answers completed" className="flex-1" />
              <span className="text-xs text-muted-foreground tabular-nums">{completed}/{total}</span>
            </div>
          </div>
          <nav aria-label="Profile steps" className="mt-4 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:mt-6 lg:px-0 [&::-webkit-scrollbar]:hidden">
            <ol className="flex gap-1 lg:flex-col">
              {items.map(item => {
                const active = item.id === activeId;
                const interactive = !!onSelect && !item.locked;
                const content = (
                  <>
                    <StepStatus done={item.done} active={active} fraction={item.fraction} />
                    <span className="truncate">{item.label}</span>
                    {!!item.left && <span className="ml-auto pl-2 text-xs text-muted-foreground tabular-nums" aria-label={`${item.left} left`}>{item.left}</span>}
                  </>
                );
                const className = `flex h-8 w-full shrink-0 items-center gap-2.5 rounded-md px-2 text-left text-[13px] whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${active ? "bg-accent font-medium text-foreground" : item.locked ? "text-muted-foreground/70" : "text-muted-foreground"} ${interactive && !active ? "hover:bg-accent/60 hover:text-foreground" : ""}`;
                return (
                  <li key={item.id} className="shrink-0 lg:w-full">
                    {interactive ? (
                      <button type="button" onClick={() => onSelect(item.id)} aria-current={active ? "step" : undefined} className={className}>{content}</button>
                    ) : (
                      <div aria-current={active ? "step" : undefined} className={className}>{content}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="shrink-0 px-5 pt-6 pb-6 sm:px-8 lg:px-12 lg:pt-10 lg:pb-8">{header}</div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-8 lg:px-12">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-background px-5 py-3 sm:px-8 lg:px-12">{footer}</div>}
      </div>
    </div>
  );
}
