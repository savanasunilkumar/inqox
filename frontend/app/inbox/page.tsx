import type { Metadata } from "next";

export const metadata: Metadata = { title: "Inbox" };

export default function Page() {
  return (
    <section aria-label="Inbox" className="w-full px-4 py-6 sm:px-6">
      <p className="text-muted-foreground">Coming soon</p>
    </section>
  );
}
