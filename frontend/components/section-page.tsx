import type { ReactNode } from "react";

export function SectionPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-12 lg:px-10">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}
