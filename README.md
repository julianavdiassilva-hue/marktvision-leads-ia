# Marktvision Leads IA

Plataforma SaaS multiempresa de prospecção, campanhas, WhatsApp, atendimento com IA e CRM.
Documentação: `CLAUDE.md` (regras) · `PROJECT_SPEC.md` · `ARCHITECTURE.md` · `DATABASE.md` · `ROADMAP.md` · `PROGRESS.md` · `TESTING.md` · `INTEGRATIONS.md`.

## Requisitos
Node.js 22+, PostgreSQL 16+.

## Instalação
```bash
npm install
cp .env.example .env    # preencha senhas, ENCRYPTION_KEY e PLATFORM_ADMIN_PASSWORD
```

Criar papéis e bancos (como superusuário do Postgres):
```sql
create role mv_owner login password 'SENHA_OWNER';
create role mv_app   login password 'SENHA_APP';     -- NÃO superusuário (RLS se aplica)
create database marktvision      owner mv_owner;
create database marktvision_test owner mv_owner;
create extension if not exists citext;               -- se mv_owner não puder criar extensões
```

```bash
npm run db:migrate     # cria todas as tabelas, RLS e catálogo de funcionalidades
npm run db:seed        # cria o administrador geral (PLATFORM_ADMIN_*)
npm run dev            # http://localhost:3000
```
Produção: `npm run build && npm start` com `COOKIE_SECURE=true` atrás de HTTPS.

## Testes
```bash
npm test                          # integração (banco de testes)
npm run build && npm run test:e2e # navegador real (requer Playwright/Chromium)
```

## Primeiro uso
1. Entre com o administrador geral.
2. **Empresas → Nova empresa**: informe só o nome (opcionalmente, já crie administrador e vendedores).
3. Na página da empresa, ajuste funcionalidades e limites.
4. Use o seletor **Ambiente** (topo) para operar dentro de uma empresa, ou entre com o login do administrador da empresa.

## Publicação (prévia online)
O arquivo `render.yaml` publica banco + aplicação no Render em um clique:
1. Crie uma conta em https://render.com e conecte sua conta do GitHub.
2. **New → Blueprint** → selecione este repositório.
3. Informe `PLATFORM_ADMIN_PASSWORD` (senha do administrador geral) quando solicitado.
4. Ao final, acesse a URL `https://marktvision-leads-ia.onrender.com` (ou a exibida pelo Render) e entre com `admin`.
As migrações e o administrador geral são aplicados automaticamente a cada início (`npm run start:prod`).
