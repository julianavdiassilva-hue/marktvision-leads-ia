import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mx-auto mt-24 max-w-lg px-6 text-center">
      <p className="text-[15px] font-bold text-brand">404</p>
      <h1 className="mt-2 text-[26px] font-bold">Página ou registro não encontrado</h1>
      <p className="mt-2 text-[16px] text-muted">O endereço não existe ou você não tem acesso a ele.</p>
      <Link href="/" className="btn btn-primary mt-6">Voltar ao início</Link>
    </div>
  );
}
