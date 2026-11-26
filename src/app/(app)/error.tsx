"use client";
import { AlertTriangle } from "lucide-react";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-lg text-center">
      <AlertTriangle className="mx-auto h-12 w-12 text-warning" />
      <h1 className="mt-4 text-[24px] font-bold">Não foi possível carregar esta página</h1>
      <p className="mt-2 text-[16px] text-muted">Ocorreu um erro inesperado. Nenhum dado foi perdido. Tente novamente.</p>
      <button onClick={reset} className="btn btn-primary mt-6">Tentar novamente</button>
    </div>
  );
}
