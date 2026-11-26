"use client";
/** Conectar WhatsApp por QR Code (pessoal ou Business) — sessão própria da empresa. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, QrCode, RefreshCw } from "lucide-react";
import { Modal } from "@/components/forms";
import { pollQrAction, startQrAction } from "@/app/actions/whatsapp";
import type { QrResult } from "@/server/integrations/whatsapp/evolution";

export function QrConnect({ ready, reuse, label = "Conectar WhatsApp" }: { ready: boolean; reuse?: { id: string; name: string }; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(reuse?.name ?? "WhatsApp Comercial");
  const [id, setId] = useState<string | null>(null);
  const [qr, setQr] = useState<QrResult | null>(null);
  const [phone, setPhone] = useState("");
  const [usePairing, setUsePairing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  useEffect(() => stop, []);

  const poll = async (cid: string, pairingPhone?: string) => {
    const r = await pollQrAction(cid, pairingPhone);
    if (!r.ok) { setError(r.error); return; }
    const d = r.data as { connected: boolean; qr: QrResult | null };
    if (d.connected) { stop(); setConnected(true); setQr(null); router.refresh(); return; }
    if (d.qr && (d.qr.base64 || d.qr.pairingCode)) setQr(d.qr);
  };
  const generate = async () => {
    setError(null); setBusy(true); setConnected(false);
    const r = await startQrAction(name, reuse?.id);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const d = r.data as { id: string; qr: QrResult };
    setId(d.id); setQr(d.qr);
    stop();
    // a cada 5s verifica se conectou; o QR do WhatsApp é renovado periodicamente
    let ticks = 0;
    timer.current = setInterval(() => { ticks++; void poll(d.id, undefined).catch(() => {}); if (ticks > 120) stop(); }, 5000);
  };
  const pairing = async () => {
    if (!id) return;
    setError(null); setBusy(true);
    await poll(id, phone);
    setBusy(false);
  };

  return (
    <>
      <button type="button" disabled={!ready} onClick={() => { setOpen(true); setError(null); }}
        className={reuse ? "btn btn-primary btn-sm" : "flex w-full items-start gap-4 rounded-2xl border-2 border-brand bg-brand-50 p-5 text-left transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-50"}>
        {reuse ? <><QrCode className="h-4 w-4" />{label}</> : (
          <>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand text-white"><QrCode className="h-6 w-6" /></span>
            <span><span className="block text-[18px] font-bold text-brand-dark">{label}</span>
              <span className="mt-1 block text-[15px] text-muted">Escaneie o QR Code com o celular — funciona com WhatsApp pessoal ou WhatsApp Business. Você continua usando o WhatsApp normalmente no celular.</span></span>
          </>
        )}
      </button>
      <Modal open={open} onClose={() => { stop(); setOpen(false); setId(null); setQr(null); }} title="Conectar WhatsApp" description="Sessão exclusiva da sua empresa. Leva menos de um minuto.">
        {connected ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-brand" />
            <p className="mt-3 text-[20px] font-bold">WhatsApp conectado!</p>
            <p className="mt-1 text-[15px] text-muted">As conversas novas aparecerão automaticamente no sistema. O número já pode ser usado nas campanhas.</p>
            <button className="btn btn-primary mt-5" onClick={() => { setOpen(false); setConnected(false); setId(null); }}>Concluir</button>
          </div>
        ) : !id ? (
          <div>
            <label className="label" htmlFor="qr-name">Nome desta conexão</label>
            <input id="qr-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Comercial — Ana" />
            {error && <p role="alert" className="mt-3 rounded-lg bg-danger-light px-3 py-2 text-[14.5px] font-medium text-danger">{error}</p>}
            <button className="btn btn-primary mt-5 w-full py-3" disabled={busy || !name.trim()} onClick={generate}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}Gerar QR Code</button>
          </div>
        ) : (
          <div>
            {!usePairing ? (
              <div className="text-center">
                {qr?.base64 ? <img src={qr.base64} alt="QR Code para conectar o WhatsApp" className="mx-auto h-64 w-64 rounded-xl border border-line" data-testid="qr-image" />
                  : <div className="mx-auto grid h-64 w-64 place-items-center rounded-xl bg-surface"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div>}
                <ol className="mx-auto mt-4 max-w-sm space-y-1.5 text-left text-[15px]">
                  <li>1. Abra o <b>WhatsApp</b> no celular</li>
                  <li>2. Toque em <b>Mais opções ⋮</b> ou <b>Configurações</b> → <b>Aparelhos conectados</b></li>
                  <li>3. Toque em <b>Conectar um aparelho</b> e aponte para este QR Code</li>
                </ol>
                <p className="mt-3 flex items-center justify-center gap-2 text-[13.5px] text-muted"><Loader2 className="h-4 w-4 animate-spin" />Aguardando leitura… o QR Code é renovado automaticamente.</p>
                <button className="mt-3 text-[14.5px] font-semibold text-brand-dark hover:underline" onClick={() => setUsePairing(true)}>Prefere conectar com código pelo número de telefone?</button>
              </div>
            ) : (
              <div>
                <label className="label" htmlFor="pair-phone">Número do WhatsApp que será conectado</label>
                <div className="flex gap-2">
                  <input id="pair-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(91) 98888-7777" inputMode="tel" />
                  <button className="btn btn-primary" disabled={busy || phone.replace(/\D/g, "").length < 10} onClick={pairing}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar código"}</button>
                </div>
                {qr?.pairingCode && (
                  <div className="mt-4 text-center">
                    <p className="text-[14px] text-muted">Digite este código no celular:</p>
                    <p className="mt-1 font-mono text-[34px] font-bold tracking-[0.2em] text-brand-dark" data-testid="pairing-code">{qr.pairingCode}</p>
                    <p className="mt-2 text-[14px] text-muted">WhatsApp → Aparelhos conectados → Conectar um aparelho → <b>Conectar com número de telefone</b>.</p>
                  </div>
                )}
                <button className="mt-4 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-brand-dark hover:underline" onClick={() => setUsePairing(false)}><RefreshCw className="h-4 w-4" />Voltar ao QR Code</button>
              </div>
            )}
            {error && <p role="alert" className="mt-3 rounded-lg bg-danger-light px-3 py-2 text-[14.5px] font-medium text-danger">{error}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
