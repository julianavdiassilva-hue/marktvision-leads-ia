"use client";
/**
 * Botão "Conectar WhatsApp" — Embedded Signup oficial da Meta (Facebook Login for Business).
 * O cliente conecta o próprio número pelo celular; o servidor troca o código pelo token da empresa.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, Smartphone } from "lucide-react";
import { completeSignupAction } from "@/app/actions/whatsapp";

type FBType = { init: (o: Record<string, unknown>) => void; login: (cb: (r: { authResponse?: { code?: string } }) => void, o: Record<string, unknown>) => void };
declare global { interface Window { FB?: FBType; fbAsyncInit?: () => void } }

function loadSdk(appId: string, version: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.FB) return resolve();
    window.fbAsyncInit = () => { window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version }); resolve(); };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/pt_BR/sdk.js"; s.async = true; s.defer = true; s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("Não foi possível carregar o login da Meta. Verifique bloqueadores de anúncio e tente novamente."));
    document.body.appendChild(s);
  });
}

export function ConnectWhatsAppButtons({ appId, configId, graphVersion, ready }: { appId: string | null; configId: string | null; graphVersion: string; ready: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<false | "coex" | "cloud">(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const session = useRef<{ event?: string; waba_id?: string; phone_number_id?: string; business_id?: string } | null>(null);
  const code = useRef<string | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "CANCEL") { setBusy(false); setMsg({ ok: false, text: "Conexão cancelada antes de concluir. Clique novamente quando quiser." }); return; }
        if (data.event === "ERROR") { setBusy(false); setMsg({ ok: false, text: `A Meta informou um erro: ${data.data?.error_message ?? "tente novamente"}${data.data?.error_code ? ` (código ${data.data.error_code})` : ""}.` }); return; }
        session.current = { event: data.event, ...data.data };
        void finish();
      } catch { /* mensagens não relacionadas */ }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async () => {
    const s = session.current, c = code.current;
    if (!s || !c || !s.waba_id) return; // aguarda o código E os dados da sessão
    session.current = null; code.current = null;
    const r = await completeSignupAction({ code: c, event: s.event as "FINISH", wabaId: s.waba_id, phoneNumberId: s.phone_number_id ?? null, businessId: s.business_id ?? null });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: r.message! } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  };

  const launch = async (mode: "coex" | "cloud") => {
    if (!appId || !configId) return;
    setMsg(null); setBusy(mode);
    try { await loadSdk(appId, graphVersion); } catch (e) { setBusy(false); return setMsg({ ok: false, text: (e as Error).message }); }
    window.FB!.login((response) => {
      if (response.authResponse?.code) { code.current = response.authResponse.code; void finish(); }
      else { setBusy(false); setMsg({ ok: false, text: "A conexão não foi concluída na Meta." }); }
    }, {
      config_id: configId, response_type: "code", override_default_response_type: true,
      extras: { setup: {}, ...(mode === "coex" ? { featureType: "whatsapp_business_app_onboarding" } : {}) },
    });
  };

  return (
    <div>
      <div className="grid gap-3 md:grid-cols-2">
        <button type="button" disabled={!ready || !!busy} onClick={() => launch("coex")}
          className="flex items-start gap-4 rounded-2xl border-2 border-brand bg-brand-50 p-5 text-left transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand text-white">{busy === "coex" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Smartphone className="h-6 w-6" />}</span>
          <span><span className="block text-[17px] font-bold text-brand-dark">Conectar WhatsApp Business do celular</span>
            <span className="mt-1 block text-[14.5px] text-muted">Recomendado. Você continua usando o app WhatsApp Business no celular; as conversas ficam sincronizadas com a Marktvision. A confirmação é feita pelo celular.</span></span>
        </button>
        <button type="button" disabled={!ready || !!busy} onClick={() => launch("cloud")}
          className="flex items-start gap-4 rounded-2xl border-2 border-line p-5 text-left transition hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-50">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface text-brand">{busy === "cloud" ? <Loader2 className="h-6 w-6 animate-spin" /> : <MessageCircle className="h-6 w-6" />}</span>
          <span><span className="block text-[17px] font-bold">Conectar um número novo (somente API)</span>
            <span className="mt-1 block text-[14.5px] text-muted">Para um número que não está em uso em nenhum aplicativo do WhatsApp. A verificação é feita por código SMS ou ligação.</span></span>
        </button>
      </div>
      {busy && <p className="mt-3 text-[14px] text-muted">Conclua as etapas na janela da Meta. Não feche esta página.</p>}
      {msg && <div role={msg.ok ? "status" : "alert"} className={`mt-4 rounded-lg border px-4 py-3 text-[15px] font-medium ${msg.ok ? "border-brand/25 bg-brand-light text-brand-dark" : "border-danger/25 bg-danger-light text-danger"}`}>{msg.text}</div>}
    </div>
  );
}
