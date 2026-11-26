import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata = { title: "Acesso não autorizado" };

export default function AccessDenied() {
  return (
    <div className="mx-auto mt-16 max-w-lg text-center">
      <ShieldAlert className="mx-auto h-12 w-12 text-danger" />
      <h1 className="mt-4 text-[26px] font-bold">Acesso não autorizado</h1>
      <p className="mt-2 text-[16px] text-muted">
        Esta área não está liberada para o seu perfil ou para o plano da sua empresa. Se precisar dela, fale com o administrador.
      </p>
      <Link href="/" className="btn btn-primary mt-6">Voltar ao início</Link>
    </div>
  );
}
