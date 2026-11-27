/**
 * Teste de desempenho (Fase 10): cria uma empresa com grande volume no banco de TESTE
 * e mede o tempo do dashboard e de cada relatório (administrador e vendedor).
 * Uso: npx tsx tests/perf/volume.ts [contatos=20000]
 */
import "dotenv/config";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

(async () => {
  if (!process.env.TEST_DATABASE_URL?.includes("test")) throw new Error("Use somente o banco de testes.");
  const N = Number(process.argv[2] ?? 20000);
  const { withScope, SYSTEM, closePool } = await import("../../src/server/db");
  const { createCompany } = await import("../../src/server/services/companies");
  const { dashboardData } = await import("../../src/server/services/dashboard");
  const { buildReport, REPORTS } = await import("../../src/server/services/reports");
  const { loginAs, ADMIN } = await import("../integration/helpers");
  const tag = Date.now().toString(36);
  const admin = await loginAs(ADMIN.username, ADMIN.password);
  await createCompany(admin, { name: `Volume ${tag}`, users: [
    { name: "Gestor Vol", username: `g.${tag}`, password: "gestorsenha", role: "company_admin" },
    ...[1, 2, 3].map((i) => ({ name: `Vendedor ${i}`, username: `v${i}.${tag}`, password: "vendsenha1", role: "seller" as const }))] });
  const gestor = await loginAs(`g.${tag}`, "gestorsenha");
  const seller = await loginAs(`v1.${tag}`, "vendsenha1");
  const cid = gestor.company!.id;
  const t0 = Date.now();
  await withScope(SYSTEM, async (db) => {
    const ids = (await db.query<{ id: string }>(`select user_id as id from company_memberships where company_id = $1 and role = 'seller' order by user_id`, [cid])).map((r) => r.id);
    await db.query(`insert into contacts (company_id, name, phone_e164, source, owner_user_id, created_at)
      select $1, 'Contato ' || g, '+55919' || lpad(g::text, 8, '0'), (array['manual','google','import','whatsapp'])[1 + g % 4], ($2::uuid[])[1 + g % 3], now() - (g % 90) * interval '1 day'
      from generate_series(1, $3) g`, [cid, ids, N]);
    await db.query(`insert into campaigns (company_id, number, name, status) select $1, g, 'Campanha ' || g, 'completed' from generate_series(1, 20) g`, [cid]);
    await db.query(`insert into campaign_contacts (company_id, campaign_id, contact_id, status)
      select $1, ca.id, c.id, (array['sent','delivered','read','replied','failed'])[1 + (abs(hashtext(c.id::text)) % 5)]
      from contacts c join lateral (select id from campaigns where company_id = $1 order by id offset (abs(hashtext(c.id::text)) % 20) limit 1) ca on true where c.company_id = $1`, [cid]);
    await db.query(`insert into conversations (company_id, contact_id, assigned_user_id, last_message_at) select company_id, id, owner_user_id, now() from contacts where company_id = $1`, [cid]);
    await db.query(`insert into messages (company_id, conversation_id, contact_id, direction, sender_type, body, status, created_at)
      select cv.company_id, cv.id, cv.contact_id, d.dir, case d.dir when 'inbound' then 'contact' else 'campaign' end, 'mensagem', case d.dir when 'inbound' then 'received' else 'delivered' end,
             now() - (abs(hashtext(cv.id::text || d.n)) % 90) * interval '1 day'
      from conversations cv cross join (values ('outbound', 1), ('outbound', 2), ('inbound', 3)) d(dir, n) where cv.company_id = $1`, [cid]);
    const pip = await db.one<{ id: string; stage: string }>(`select p.id, (select id from pipeline_stages s where s.pipeline_id = p.id order by position limit 1) as stage from pipelines p where p.company_id = $1 limit 1`, [cid]);
    await db.query(`insert into opportunities (company_id, contact_id, pipeline_id, stage_id, title, owner_user_id, status, value, won_at, lost_at, lost_reason)
      select company_id, id, $2, $3, 'Negócio', owner_user_id, s, 500, case s when 'won' then now() - (g % 60) * interval '1 day' end, case s when 'lost' then now() - (g % 60) * interval '1 day' end, case s when 'lost' then 'Preço' end
      from (select c.*, row_number() over () g, (array['open','won','lost'])[1 + (row_number() over ()) % 3] s from contacts c where c.company_id = $1 limit $4) x`, [cid, pip.id, pip.stage, Math.floor(N / 4)]);
    await db.query(`insert into sales (company_id, opportunity_id, contact_id, seller_user_id, amount, sold_at) select company_id, id, contact_id, owner_user_id, value, won_at from opportunities where company_id = $1 and status = 'won'`, [cid]);
  });
  await withScope(SYSTEM, (db) => db.query("analyze"));
  console.log(`Volume criado em ${((Date.now() - t0) / 1000).toFixed(1)} s: ${N} contatos, ${N * 3} mensagens, ${Math.floor(N / 4)} negociações`);
  const period = { from: new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) };
  const time = async (label: string, fn: () => Promise<unknown>) => { const s = performance.now(); await fn(); const ms = performance.now() - s; console.log(`${ms > 2000 ? "LENTO" : "ok   "} ${label.padEnd(40)} ${ms.toFixed(0)} ms`); return ms; };
  let worst = 0;
  for (const [who, ctx] of [["administrador", gestor], ["vendedor", seller]] as const) {
    worst = Math.max(worst, await time(`dashboard (${who})`, () => dashboardData(ctx, period)));
    for (const t of Object.keys(REPORTS)) {
      if (REPORTS[t].adminOnly && who === "vendedor") continue;
      worst = Math.max(worst, await time(`relatório ${t} (${who})`, () => buildReport(ctx, t, period)));
    }
  }
  console.log(`Pior tempo: ${worst.toFixed(0)} ms`);
  await closePool();
  process.exit(worst > 2000 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
