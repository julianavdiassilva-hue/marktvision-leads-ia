# PROJECT_SPEC.md — Especificação funcional

## Perfis
| Perfil | Escopo |
|---|---|
| Administrador geral (Marktvision) | Toda a plataforma: empresas, usuários, planos, funcionalidades, limites, auditoria. Pode entrar no ambiente de qualquer empresa. |
| Administrador da empresa | Somente a própria empresa, dentro das funcionalidades liberadas. Gerencia a equipe (exige "Equipe Comercial"). |
| Vendedor | Somente recursos autorizados e os próprios contatos, conversas, negociações e resultados. |

## Funcionalidades controláveis (18)
dashboard, google_search, spreadsheet_import, contact_lists, contacts, campaigns, scripts, tags, conversations, ai_chatbot, ai_messages, whatsapp, crm, sales_team, broadcasts, goals, reports, data_export.

Permissão efetiva = (funcionalidades do plano + liberações da empresa − bloqueios da empresa) ∩ perfil do usuário ± permissões individuais. Uma permissão individual nunca ultrapassa o contratado pela empresa.
Padrão do vendedor: dashboard, contacts, contact_lists, tags, conversations, ai_messages, crm, goals, reports.
Exclusivas de administrador (salvo concessão individual): sales_team, whatsapp, ai_chatbot.

## Menu
Dashboard · Campanhas · Contatos e listas · Conversas · CRM Comercial · Etiquetas · Chatbot IA · Contexto da empresa · WhatsApp Comercial · Equipe Comercial · Relatórios · Configurações.
Administrador geral: + Empresas · Usuários · Planos e permissões · Administração da plataforma.

## Módulos (resumo do escopo contratado)
1. **Empresas** — cadastro só com nome; acessos opcionais na mesma tela; ativar/desativar; plano, funcionalidades e limites.
2. **Usuários** — nome, login, senha (mín. 8, sem complexidade obrigatória), tipo; reset de senha; ativação; permissões individuais.
3. **Contatos e listas** — base central, ID único por empresa, deduplicação por telefone normalizado (E.164), origem, consentimento, etiquetas, responsável, exportação.
4. **Pesquisa Google** — Google Places API (New): segmento/palavra-chave + cidade/estado/bairro/região; nome, telefone, endereço, site, categoria, avaliação; enviar para lista/campanha. Sem dados inventados; telefone público ≠ consentimento.
5. **Importação** — XLS/XLSX/CSV, detecção e mapeamento de colunas, normalização, duplicidades, prévia, nova lista ou lista existente.
6. **Campanhas** — listagem horizontal compacta (nº, nome, lista, contatos, enviados, entregues, respostas, falhas, convertidos, vendas, progresso, status); ações iniciar/pausar/retomar/editar/duplicar/cancelar/resultados/arquivar. Criação em 7 etapas na mesma tela (nome, origem com Google/planilha/lista/manual, seleção, script com IA, WhatsApp, modo de atendimento, execução/agendamento).
7. **WhatsApp Comercial** — Meta Cloud API; conectar/desconectar/testar; envio, webhooks, status de entrega, falhas, modelos aprovados; camada de provedores plugável.
8. **Conversas** — 3 colunas (lista, histórico + envio com arquivos/respostas rápidas/IA, painel do contato com CRM). Transferência entre vendedores; IA por conversa; vendedor assume → IA para.
9. **Contexto da empresa** — base de conhecimento por categoria + documentos; isolada por empresa.
10. **Chatbot IA** — nome, personalidade, tom, instruções, horários, critérios de qualificação e transferência, mensagens inicial/final; só responde com informação cadastrada.
11. **CRM** — Kanban + lista; funil personalizável (padrão de 9 etapas criado automaticamente); oportunidade com contato, vendedor, campanha de origem, valor, próximo retorno; venda e motivo de perda atualizam indicadores.
12. **Equipe Comercial** — vendedores, distribuição manual/automática, transferência, metas individuais/coletivas, indicadores por vendedor.
13. **Etiquetas** — nome + cor, ligadas ao contato; manuais e por regras.
14. **Dashboard e Relatórios** — dados reais; filtros por período, campanha, vendedor, origem, empresa; exportação PDF/Excel/CSV.
