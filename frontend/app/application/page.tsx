import type { Metadata } from "next";
import { ApplicationSession } from "@/components/application-session";
export const metadata: Metadata = { title: "Live application" };
export default function Page() {
  return <ApplicationSession />;
}
