import { NextResponse, type NextRequest } from "next/server";

/**
 * Filtro rápido: sem cookie de sessão => redireciona ao login.
 * A autorização REAL acontece no servidor (sessão validada no banco
 * em cada página, ação e rota), nunca apenas aqui.
 */
const PUBLIC = ["/login", "/entrar", "/api/webhooks", "/api/health", "/api/marca"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.get("mv_session")?.value) {
    const url = req.nextUrl.clone();
    // Volta à tela de login com a identidade visual da empresa do usuário, se conhecida.
    const slug = req.cookies.get("mv_empresa")?.value;
    url.pathname = slug && /^[a-z0-9-]{2,60}$/.test(slug) ? `/entrar/${slug}` : "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }
  // Informa o caminho ao layout, que aplica a guarda de rotas no servidor
  const headers = new Headers(req.headers);
  headers.set("x-mv-path", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
