# CLAUDE.md — Regras permanentes do projeto Marktvision Leads IA

Leia este arquivo, `PROGRESS.md` e `ARCHITECTURE.md` ANTES de qualquer alteração.

## Produto
SaaS multiempresa: prospecção → contatos → campanha → script → WhatsApp → conversas → IA → vendedor → CRM → venda → relatórios.
Todos os módulos operam sobre a MESMA base relacional. O **contato** (`contacts`) é a entidade central.

## Regras invioláveis
1. Não criar funcionalidades desconectadas; todo módulo usa as tabelas centrais (contacts, campaigns, conversations, opportunities...).
2. Não remover nem quebrar funcionalidades existentes. Rodar `npm test` e `npm run test:e2e` antes de concluir.
3. Não criar botões sem funcionamento. Módulo não entregue mostra `ModulePending` (com a fase), nunca dados falsos.
4. Não simular integrações. Sem credencial → mensagem clara de configuração pendente.
5. Não apresentar dados fictícios como reais. Indicadores = consultas ao banco.
6. Não duplicar cadastros (índices únicos por empresa: telefone, place_id; `campaign_contacts(campaign_id, contact_id)`).
7. Somente o nome é obrigatório em empresa; usuário = nome, login, senha, tipo.
8. Isolamento por empresa em DUAS camadas: serviço (filtro `company_id` + guardas) e banco (RLS). Nunca confiar no frontend.
9. Senhas com bcrypt; tokens de sessão armazenados só como SHA-256; credenciais de integrações criptografadas (`ENCRYPTION_KEY`).
10. Nenhuma credencial no código ou no frontend; usar `.env` (modelo em `.env.example`).
11. Mensagens ao usuário em português. Estados de carregamento em toda ação.
12. Operações multi-etapa em uma única transação (`withScope`) — sem dados pela metade.
13. Respeitar LGPD e políticas da Meta (consentimento, opt-out, modelos aprovados, janela de 24h).
14. Atualizar `PROGRESS.md`, `TESTING.md` e `DATABASE.md` ao final de cada entrega.

## Padrões de código
- Lógica de negócio em `src/server/services/*` (recebe `AuthContext`, testável sem Next).
- Server Actions finas em `src/app/actions/*`, sempre via `runAction` (autenticação + erro em PT-BR).
- Acesso ao banco SOMENTE por `withScope(scopeOf(ctx), db => ...)`. `SYSTEM` apenas para login, filas e webhooks.
- Toda ação valida: autenticação → empresa (`assertCompany`) → funcionalidade (`assertFeature`) → perfil.
- Rotas novas: adicionar ao `MAIN_NAV` (`src/lib/navigation.ts`) — o menu e a guarda de rotas do layout derivam dele.
- Migrações novas: `db/migrations/NNNN_nome.sql` (nunca editar migração já aplicada). Tabela comercial nova = `company_id` + política RLS `tenant_isolation`.
- Validação com zod (`src/server/validation.ts`); campos opcionais vazios viram `undefined`.
- Visual: tokens em `src/app/globals.css` (verde #008C48, fundo branco, texto #172B22, fonte 15–16px).
