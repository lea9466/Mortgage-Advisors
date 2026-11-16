"use client";

import { useEffect } from "react";
import { logoutAction } from "@/app/(auth)/actions";

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const CHECK_EVERY_MS = 30 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "visibilitychange"] as const;

/**
 * Signs the user out after 30 minutes without activity, so an unattended
 * computer does not stay logged in. Renders nothing.
 */
export function IdleLogout() {
  useEffect(() => {
    let lastActivity = Date.now();
    let signingOut = false;

    const markActive = () => {
      lastActivity = Date.now();
    };
    const check = () => {
      if (signingOut || Date.now() - lastActivity < IDLE_LIMIT_MS) return;
      signingOut = true;
      void logoutAction();
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, markActive, { passive: true });
    }
    const timer = window.setInterval(check, CHECK_EVERY_MS);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, markActive);
      }
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
