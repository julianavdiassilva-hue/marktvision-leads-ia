"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Atualiza os dados da tela periodicamente (somente com a aba visível): todos veem as mesmas informações. */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [router, seconds]);
  return null;
}
