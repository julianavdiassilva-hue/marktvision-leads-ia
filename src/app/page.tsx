import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/next";

export default async function Home() {
  const ctx = await getAuth();
  if (!ctx) redirect("/login");
  redirect(ctx.user.isPlatformAdmin && !ctx.company ? "/admin/empresas" : "/dashboard");
}
