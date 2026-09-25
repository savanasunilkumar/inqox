"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useAgentFetch } from "@/lib/use-agent-fetch";

export function ApplicationSnapshot({ timestamp }: { timestamp: number }) {
  const agentFetch = useAgentFetch();
  const [source, setSource] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    agentFetch(`/api/agent/runs/screenshot?v=${timestamp}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
        setError(false);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [agentFetch, timestamp]);
  return source ? <Image unoptimized width={1280} height={900} src={source} alt="Latest application preview" className="h-auto w-full" /> : <p className="p-6 text-sm text-muted-foreground">{error ? "Couldn’t load the preview." : "Loading preview…"}</p>;
}
