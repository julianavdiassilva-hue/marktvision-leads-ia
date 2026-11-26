# ARCHITECTURE.md — Arquitetura técnica

## Stack (compatibilidade avaliada)
| Camada | Escolha | Motivo |
|---|---|---|
| Web | Next.js 16 (App Router) + React 19 + TypeScript 5.9 | Frontend e backend no mesmo projeto, Server Actions seguras |
| Estilo | Tailwind CSS 4 + lucide-react | Identidade visual por tokens |
| Banco | PostgreSQL 16 (driver `pg`) + SQL versionado | RLS nativo, integridade relacional |
| Auth | Própria: login por **nome de usuário**, bcrypt, sessão opaca em banco | Supabase Auth exige e-mail; requisito pede login simples |
| Filas | Tabela `jobs` com `FOR UPDATE SKIP LOCKED` (worker Node) | Sem infraestrutura extra; compatível com qualquer Postgres |
| IA | Anthropic Claude (API) | Fase 08 |
| Integrações | Google Places API (New), Meta WhatsApp Cloud API | Fases 03 e 05 |

Supabase continua compatível: basta apontar `DATABASE_URL`/`DATABASE_OWNER_URL` para o Postgres do Supabase (as migrações e RLS são SQL padrão). O Supabase Auth não é usado.

## Camadas
```
Navegador ──> proxy.ts (sem cookie → /login; injeta x-mv-path)
          ──> app/(app)/layout.tsx  ← guarda central de rotas (perfil, empresa, funcionalidade) → HTTP 307
          ──> páginas (requireModulePage/requirePlatformPage: 2ª camada)
          ──> Server Actions (app/actions) → runAction → services
services (src/server/services) ── guardas (assertCompany/assertFeature/...) ── withScope(scope) ── PostgreSQL (RLS)
```

## Isolamento multiempresa (defesa em profundidade)
1. Sessão validada no banco a cada requisição (`resolveSession`): usuário ativo, vínculo ativo, empresa ativa. Desativar = acesso revogado imediatamente.
2. Serviços derivam `company_id` só da sessão (nunca do formulário, exceto admin geral).
3. `withScope` abre transação e define `app.company_id`, `app.user_id`, `app.platform_admin`, `app.system`.
4. A aplicação conecta como `mv_app` (não superusuário): as políticas RLS bloqueiam leitura/escrita de outra empresa mesmo com SQL incorreto.

## Fluxo integrado de dados
```
Google Places / Planilha / Manual / WhatsApp recebido
        └─> contacts (único por empresa) ─┬─> contact_list_members ─> contact_lists
                                          ├─> contact_tags ─> tags
campaigns(list_id, script, whatsapp) ─> campaign_contacts(status por contato) ─> jobs ─> messages(outbound)
webhook Meta ─> messages(inbound/status) ─> conversations(origin_campaign_id, ai_enabled, assigned_user_id)
conversations ─> opportunities(contact, campaign, conversation, stage) ─> sales ─> dashboard/relatórios/metas
domain_events: linha do tempo de tudo (relatórios e histórico do contato)
```

## Estrutura de pastas
```
db/migrations/        SQL versionado (0001 núcleo, 0002 domínio comercial, 0003 permissões do papel da app)
scripts/              migrate, seed (admin geral), reset (dev/teste)
src/lib/              catálogo de funcionalidades, navegação, guarda de rotas, formatação (compartilhado)
src/server/           db, auth (core/next/password), guards, permissions, audit, errors, validation
src/server/services/  companies, users, plans, platform, dashboard (+ módulos das próximas fases)
src/app/              páginas (login, (app)/...), actions, api/health
src/components/       ui, forms (ActionForm, ToggleSwitch, Modal), shell, admin/*
tests/integration/    Vitest contra banco de testes
tests/e2e/            Playwright (navegador real)
```

## Implantação
| Modo | Arquivo | Uso |
|---|---|---|
| Computador Windows (gratuito) | `docker-compose.yml` + `INSTALAR.bat` (`infra/windows/marktvision.ps1`) | Piloto com 3 vendedores; acesso local e Cloudflare Tunnel |
| Render (pago) | `render.yaml` | Hospedagem profissional futura |
| Qualquer VPS com Docker | `docker-compose.yml` | Alternativa profissional |
A mesma imagem e as mesmas migrações valem nos três modos: migrar = backup (`pg_dump`) + restauração.
