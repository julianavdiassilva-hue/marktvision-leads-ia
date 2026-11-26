import { Clock } from "lucide-react";
import { PageHeader } from "./ui";

/** Página de módulo ainda não entregue: informa a fase, sem botões falsos nem dados fictícios. */
export function ModulePending({ title, phase, description, connections }: { title: string; phase: number; description: string; connections: string[] }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="panel p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-light"><Clock className="h-6 w-6 text-brand" /></div>
          <div>
            <p className="text-[18px] font-bold">Módulo em implantação — Fase {String(phase).padStart(2, "0")}</p>
            <p className="mt-1 max-w-2xl text-[15px] text-muted">
              O acesso a esta área já está controlado pelo plano e pelas permissões. As tabelas e relacionamentos deste módulo já existem no banco de dados; as telas e operações serão liberadas quando a fase for concluída e testada.
            </p>
            <p className="mt-5 text-[14px] font-bold uppercase tracking-wide text-muted">Integração com os demais módulos</p>
            <ul className="mt-2 space-y-1.5 text-[15px]">{connections.map((c) => <li key={c} className="flex gap-2"><span className="text-brand">•</span>{c}</li>)}</ul>
          </div>
        </div>
      </div>
    </>
  );
}
