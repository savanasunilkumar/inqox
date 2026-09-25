"use client";

import Image from "next/image";
import { useState } from "react";

type Props = { company: string; domain: string | null; sourceKey: string };

export function CompanyLogo({ company, domain, sourceKey }: Props) {
  const params = new URLSearchParams({ source: sourceKey, v: "2" });
  if (domain) params.set("domain", domain);
  const sources = [`/api/company-logo?${params}`];
  if (domain) sources.push(`/api/company-logo?${new URLSearchParams({ source: sourceKey, v: "2" })}`);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const src = sources.find((url) => !failedSources.includes(url));
  const initials = company.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase();

  return (
    <span aria-hidden="true" className="relative flex size-10 shrink-0 items-center justify-center text-xs font-semibold text-muted-foreground">
      <span className={src && loadedSource === src ? "invisible" : undefined}>{initials}</span>
      {src && (
        <Image
          src={src}
          alt=""
          width={32}
          height={32}
          unoptimized
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedSource(src)}
          onError={() => setFailedSources((failed) => [...failed, src])}
          className={`absolute inset-0 size-full p-1 object-contain ${loadedSource === src ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
