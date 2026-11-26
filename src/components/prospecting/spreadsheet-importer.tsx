"use client";
import clsx from "clsx";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Badge } from "@/components/ui";
import { DestinationPicker, destinationOpts, type Destination } from "./destination";
import { analyzeImportAction, runImportAction } from "@/app/actions/prospecting";
import { IMPORT_FIELDS, MAX_IMPORT_ROWS, suggestMapping, type ImportField } from "@/lib/import-mapping";
import { formatPhone } from "@/lib/phone";
import { fmtInt } from "@/lib/format";
import type { AnalyzedRow } from "@/server/services/imports";

type Parsed = { fileName: string; headers: string[]; rows: string[][] };
type Result = { created: number; updated: number; invalid: number; listId: string | null; contactIds: string[] };

/** Lê XLS/XLSX/CSV no navegador (o arquivo não é processado no servidor). */
async function parseFile(file: File): Promise<Parsed> {
  if (file.size > 15 * 1024 * 1024) throw new Error("Arquivo maior que 15 MB.");
  const ext = file.name.toLowerCase().split(".").pop();
  if (!["xls", "xlsx", "csv"].includes(ext ?? "")) throw new Error("Formato não suportado. Envie um arquivo XLS, XLSX ou CSV.");
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  let wb;
  if (ext === "csv") {
    const bytes = new Uint8Array(buf);
    let text = new TextDecoder("utf-8").decode(bytes);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(bytes); // CSV salvo pelo Excel em português
    wb = XLSX.read(text.replace(/^﻿/, ""), { type: "string", raw: true });
  } else {
    wb = XLSX.read(buf, { type: "array" });
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("A planilha está vazia.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  const clean = matrix.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some(Boolean));
  if (clean.length < 2) throw new Error("A planilha precisa de uma linha de cabeçalho e pelo menos uma linha de dados.");
  const width = Math.max(...clean.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => clean[0][i] || `Coluna ${i + 1}`);
  const rows = clean.slice(1);
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`A planilha tem ${fmtInt(rows.length)} linhas. Divida em arquivos de até ${fmtInt(MAX_IMPORT_ROWS)} linhas.`);
  return { fileName: file.name, headers, rows };
}

const STATUS: Record<AnalyzedRow["status"], { label: string; tone: "green" | "gray" | "amber" | "red" }> = {
  new: { label: "Novo", tone: "green" }, existing: { label: "Já na base", tone: "gray" },
  file_duplicate: { label: "Repetido", tone: "amber" }, invalid: { label: "Inválido", tone: "red" },
};

export function SpreadsheetImporter({ lists, team, canLists, canAssign, onDone }: {
  lists: { id: string; name: string }[]; team: { id: string; name: string }[]; canLists: boolean; canAssign: boolean;
  onDone?: (r: Result) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportField, number>>>({});
  const [analysis, setAnalysis] = useState<{ rows: AnalyzedRow[]; summary: Record<string, number> } | null>(null);
  const [dest, setDest] = useState<Destination>({ mode: canLists ? "new" : "none", newListName: "", listId: "", ownerUserId: "" });
  const [filter, setFilter] = useState<AnalyzedRow["status"] | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  const mapped = () => parsed!.rows.map((r) => Object.fromEntries(
    Object.entries(mapping).filter(([, i]) => i !== undefined && i >= 0).map(([k, i]) => [k, r[i as number] ?? ""])));

  const onFile = (file?: File) => {
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const p = await parseFile(file);
        setParsed(p); setMapping(suggestMapping(p.headers));
        setDest((d) => ({ ...d, newListName: file.name.replace(/\.[^.]+$/, "").slice(0, 100) }));
        setStep(2);
      } catch (e) { setError((e as Error).message || "Não foi possível ler o arquivo."); }
    });
  };
  const analyze = () => {
    if (!Object.values(mapping).some((v) => v !== undefined && v >= 0)) return setError("Associe pelo menos uma coluna (nome, telefone, e-mail ou empresa).");
    setError(null);
    start(async () => {
      const r = await analyzeImportAction(mapped());
      if (!r.ok) setError(r.error); else { setAnalysis(r.data!); setStep(3); }
    });
  };
  const runIt = () => {
    if (dest.mode === "new" && !dest.newListName.trim()) return setError("Informe o nome da nova lista.");
    setError(null);
    start(async () => {
      const r = await runImportAction(mapped(), { ...destinationOpts(dest), fileName: parsed!.fileName });
      if (!r.ok) setError(r.error); else { setResult(r.data as Result); setStep(4); onDone?.(r.data as Result); }
    });
  };

  return (
    <div>
      <ol className="mb-6 flex flex-wrap gap-2 text-[14px] font-semibold">
        {["Arquivo", "Colunas", "Prévia e destino", "Concluído"].map((s, i) => (
          <li key={s} className={clsx("rounded-full px-3.5 py-1.5", step === i + 1 ? "bg-brand text-white" : step > i + 1 ? "bg-brand-light text-brand-dark" : "bg-surface text-muted")}>{i + 1}. {s}</li>
        ))}
      </ol>
      {error && <div role="alert" className="mb-4 rounded-lg border border-danger/25 bg-danger-light px-4 py-3 text-[15px] font-medium text-danger">{error}</div>}

      {step === 1 && (
        <label className={clsx("flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand/40 bg-brand-50 px-6 py-14 text-center transition hover:bg-brand-light", pending && "opacity-60")}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
          {pending ? <Loader2 className="h-10 w-10 animate-spin text-brand" /> : <Upload className="h-10 w-10 text-brand" />}
          <p className="mt-3 text-[18px] font-bold">Arraste a planilha aqui ou clique para escolher</p>
          <p className="mt-1 text-[15px] text-muted">XLS, XLSX ou CSV · até {fmtInt(MAX_IMPORT_ROWS)} linhas · a primeira linha deve ser o cabeçalho</p>
          <input type="file" data-testid="file-input" accept=".xls,.xlsx,.csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      )}

      {step === 2 && parsed && (
        <div>
          <p className="mb-4 flex items-center gap-2 text-[15px]"><FileSpreadsheet className="h-5 w-5 text-brand" /><b>{parsed.fileName}</b> · {fmtInt(parsed.rows.length)} linha(s). Confira a associação das colunas (identificada automaticamente):</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label" htmlFor={`map-${f.key}`}>{f.label}</label>
                <select id={`map-${f.key}`} className={clsx("input", mapping[f.key] !== undefined && mapping[f.key]! >= 0 && "border-brand bg-brand-50")}
                  value={mapping[f.key] ?? -1} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}>
                  <option value={-1}>Não importar</option>
                  {parsed.headers.map((h, i) => <option key={i} value={i}>{h}{parsed.rows[0]?.[i] ? ` (ex.: ${parsed.rows[0][i].slice(0, 30)})` : ""}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-between">
            <button className="btn btn-secondary" onClick={() => { setStep(1); setParsed(null); }}>Trocar arquivo</button>
            <button className="btn btn-primary" disabled={pending} onClick={analyze}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Gerar prévia</button>
          </div>
        </div>
      )}

      {step === 3 && analysis && (
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            {([["all", "Todas", analysis.summary.total], ["new", "Novos", analysis.summary.new], ["existing", "Já na base", analysis.summary.existing], ["file_duplicate", "Repetidos na planilha", analysis.summary.file_duplicate], ["invalid", "Inválidos", analysis.summary.invalid]] as const).map(([k, l, n]) => (
              <button key={k} onClick={() => setFilter(k)} className={clsx("rounded-lg border px-3.5 py-2 text-[14px] font-semibold", filter === k ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white")}>{l}: {fmtInt(n)}</button>
            ))}
          </div>
          <div className="panel max-h-[420px] overflow-auto">
            <table className="table">
              <thead><tr><th>Linha</th><th>Contato</th><th>Telefone</th><th>Situação</th></tr></thead>
              <tbody>{analysis.rows.filter((r) => filter === "all" || r.status === filter).slice(0, 300).map((r) => (
                <tr key={r.index}><td className="text-muted">{r.index + 2}</td><td>{r.display || "—"}</td><td>{formatPhone(r.phone) || "—"}</td>
                  <td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>{r.reason && r.status !== "new" && <p className="mt-0.5 text-[13px] text-muted">{r.reason}</p>}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-2 text-[13px] text-muted">Contatos já existentes não são duplicados: apenas os campos vazios são completados. Linhas inválidas são ignoradas.</p>
          <div className="mt-6 rounded-xl border border-line bg-surface p-5">
            <DestinationPicker value={dest} onChange={setDest} lists={lists} team={team} canLists={canLists} canAssign={canAssign} />
          </div>
          <div className="mt-6 flex justify-between">
            <button className="btn btn-secondary" onClick={() => setStep(2)}>Voltar</button>
            <button className="btn btn-primary" disabled={pending || analysis.summary.total === analysis.summary.invalid} onClick={runIt}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}Importar {fmtInt(analysis.summary.total - analysis.summary.invalid)} linha(s)
            </button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className="rounded-2xl border border-brand/30 bg-brand-light p-8 text-center">
          <p className="text-[22px] font-bold text-brand-dark">Importação concluída</p>
          <p className="mt-2 text-[16px]">{fmtInt(result.created)} contato(s) novos · {fmtInt(result.updated)} já existentes atualizados · {fmtInt(result.invalid)} linha(s) ignoradas</p>
          <div className="mt-5 flex justify-center gap-2.5">
            {result.listId && <Link className="btn btn-primary" href={`/contatos/listas/${result.listId}`}>Abrir a lista</Link>}
            <button className="btn btn-secondary" onClick={() => { setStep(1); setParsed(null); setAnalysis(null); setResult(null); }}>Importar outra planilha</button>
          </div>
        </div>
      )}
    </div>
  );
}
