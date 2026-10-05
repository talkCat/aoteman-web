"use client";

import { useZoerIframe } from "@/hooks/useZoerIframe";

export default function GlobalClientEffects() {
  useZoerIframe();
  return null;
}

