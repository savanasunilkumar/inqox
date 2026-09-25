"use client";
import { useAuth, useUser } from "@clerk/nextjs";
import { useCallback } from "react";

export function useAgentFetch() {
  const { getToken } = useAuth();
  const { user } = useUser();
  return useCallback(async (path: string, init: RequestInit = {}) => {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin || (!url.pathname.startsWith("/api/agent/") && url.pathname !== "/api/jobs" && !/^\/api\/jobs\/[1-9]\d*$/.test(url.pathname))) throw new Error("Invalid application request.");
    const send = async (refresh: boolean) => {
      const token = await getToken({ skipCache: refresh });
      if (!token) throw new Error("Please sign in to continue.");
      const headers = new Headers(init.headers);
      headers.set("X-Clerk-Session-Token", token);
      const email = user?.primaryEmailAddress?.emailAddress;
      if (email) headers.set("X-Clerk-User-Email", email);
      return fetch(url, { ...init, headers, cache: "no-store" });
    };
    const response = await send(false);
    return response.status === 401 ? send(true) : response;
  }, [getToken, user]);
}

