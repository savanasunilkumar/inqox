import type { Metadata } from "next";
import { Suspense } from "react";
import { JobBoard } from "@/components/job-board";
import Loading from "./loading";

export const metadata: Metadata = { title: "Job Board" };

export default function JobBoardPage() {
  return <Suspense fallback={<Loading />}><JobBoard /></Suspense>;
}
