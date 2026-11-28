import { publicLogo } from "@/server/services/branding";

export const dynamic = "force-dynamic";

/** Logomarca pública da empresa (exibida também na tela de login dela). Somente imagens PNG/JPG/WEBP validadas no envio. */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const file = await publicLogo(companyId).catch(() => null);
  if (!file) return new Response("Logomarca não encontrada.", { status: 404 });
  const versioned = new URL(req.url).searchParams.has("v");
  return new Response(new Uint8Array(file.content), { headers: {
    "Content-Type": file.mime_type, "Content-Length": String(file.size_bytes), ETag: `"${file.sha256}"`,
    "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}
