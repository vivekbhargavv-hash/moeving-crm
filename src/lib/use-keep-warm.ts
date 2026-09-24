"use client";

import * as React from "react";

/** Neon suspends after ~5 minutes idle, so a ping every 4 keeps it awake. */
const PING_EVERY_MS = 4 * 60_000;
/**
 * Only while somebody is actually here. A tab left open on a desk overnight
 * must not keep the database awake — that spends the free plan's compute.
 */
const ACTIVE_FOR_MS = 10 * 60_000;

/**
 * Keeps the database awake while the app is in use, and wakes it the moment
 * somebody comes back to the tab — so the start-up wait happens while they
 * are still reading, not after they tap.
 */
export function useKeepWarm() {
  React.useEffect(() => {
    let lastActivity = Date.now();
    let lastPing = 0;

    const ping = () => {
      if (document.visibilityState !== "visible") return;
      // Anything within the last minute has already done the job.
      if (Date.now() - lastPing < 60_000) return;
      lastPing = Date.now();
      fetch("/api/warm", { cache: "no-store", keepalive: true }).catch(() => {});
    };

    const onActivity = () => {
      const wasIdle = Date.now() - lastActivity > PING_EVERY_MS;
      lastActivity = Date.now();
      if (wasIdle) ping();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        lastActivity = Date.now();
        ping();
      }
    };

    const timer = setInterval(() => {
      if (Date.now() - lastActivity < ACTIVE_FOR_MS) ping();
    }, PING_EVERY_MS);

    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const e of events) {
      window.addEventListener(e, onActivity, { passive: true, capture: true });
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      for (const e of events) {
        window.removeEventListener(e, onActivity, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
}
