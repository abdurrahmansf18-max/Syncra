"use client";

import { useEffect, useState } from "react";

type ToastPayload = {
  type?: "error" | "info";
  message?: string;
};

export function GlobalToast() {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => {
    let timeoutId: number | null = null;

    const showToast = (event: Event) => {
      const customEvent = event as CustomEvent<ToastPayload>;
      const message = customEvent.detail?.message?.trim();
      if (!message) return;

      setToast({
        type: customEvent.detail?.type ?? "error",
        message,
      });

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => setToast(null), 4500);
    };

    window.addEventListener("appToast", showToast as EventListener);
    return () => {
      window.removeEventListener("appToast", showToast as EventListener);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  if (!toast) return null;

  const tone =
    toast.type === "info"
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-destructive/40 bg-destructive/10 text-destructive";

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] max-w-sm">
      <div className={`rounded-md border px-4 py-3 text-sm shadow-lg ${tone}`}>
        {toast.message}
      </div>
    </div>
  );
}
