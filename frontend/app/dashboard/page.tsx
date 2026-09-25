import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <section aria-label="Dashboard" className="w-full px-4 py-6 sm:px-6">
      <p className="text-muted-foreground">Coming soon</p>
    </section>
  );
}
