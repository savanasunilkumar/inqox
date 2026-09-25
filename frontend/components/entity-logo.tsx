"use client";

import Image from "next/image";
import { useState } from "react";
import type { LogoEntityKind } from "@/lib/company-logos";

type Props = { name: string; kind: LogoEntityKind; location?: string };

export function EntityLogo({ name, kind, location }: Props) {
  const src = `/api/entity-logo?${new URLSearchParams(location ? { kind, name, location } : { kind, name })}`;
  const [status, setStatus] = useState<{ src: string; state: "loaded" | "failed" } | null>(null);
  const state = status?.src === src ? status.state : "loading";
  const initials = name.trim().split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  return (
    <span aria-hidden="true" className="relative z-10 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background text-[11px] font-semibold text-muted-foreground">
      <span className={state === "loaded" ? "invisible" : undefined}>{initials || "?"}</span>
      {state !== "failed" && name.trim() && (
        <Image
          src={src}
          alt=""
          width={32}
          height={32}
          unoptimized
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setStatus({ src, state: "loaded" })}
          onError={() => setStatus({ src, state: "failed" })}
          className={`absolute inset-0 size-full p-1 object-contain ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}
