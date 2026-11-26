# PROGRESS.md — Controle de funcionalidades

Legenda: ✅ concluído e testado · 🔶 estrutura pronta (banco/permissão), tela pendente · ⏳ pendente

## Fase 01 — ✅ concluída (26/11/2026)
| Item | Status | Evidência |
|---|---|---|
| Projeto Next.js 16 + TS + Tailwind 4 | ✅ | `npm run build` |
| Esquema completo do banco (0001–0003) com FKs, índices e RLS | ✅ | testes de RLS |
| Login por nome de usuário, sessão em banco, logout | ✅ | integração + E2E |
| Proteção contra força bruta | ✅ | integração |
| Empresas: cadastro só com nome, acessos opcionais na mesma tela (transação única) | ✅ | integração + E2E |
| Editar, ativar/desativar empresa (derruba sessões) | ✅ | integração + E2E |
| Usuários: criar/editar/ativar/redefinir senha sem perder a própria sessão | ✅ | integração + E2E |
| Planos: CRUD, funcionalidades e limites | ✅ | integração |
| Funcionalidades por empresa (botões liga/desliga) e restauração do plano | ✅ | integração + E2E |
| Permissões individuais por usuário (limitadas ao contratado) | ✅ | integração + E2E |
| Limites (usuários, vendedores...) aplicados no backend | ✅ | integração |
| Menu lateral dinâmico + guarda de rotas no servidor (HTTP 307) | ✅ | E2E |
| Admin geral: seletor de ambiente da empresa | ✅ | E2E |
| Equipe Comercial (cadastro de vendedores pelo admin da empresa) | ✅ | E2E |
| Configurações: troca de senha, dados da empresa | ✅ | integração |
| Administração da plataforma: utilização real + auditoria | ✅ | E2E |
| Dashboard inicial com indicadores reais (zerados até haver dados) | ✅ | integração |
| Responsividade (390 px sem rolagem horizontal) | ✅ | E2E |

## Fase 02 — ✅ concluída (26/11/2026)
| Item | Status | Evidência |
|---|---|---|
| Base central de contatos (só um identificador obrigatório) | ✅ | integração + E2E |
| Normalização de telefone E.164 (padrão Brasil) e bloqueio de duplicados | ✅ | integração + E2E |
| `upsertContacts`: grava sem duplicar e completa campos vazios (reutilizado por Google, planilhas e campanhas) | ✅ | integração |
| Busca, filtros (lista, etiqueta, responsável, origem, situação, consentimento) e paginação | ✅ | E2E |
| Seleção individual, por página e "todos os resultados do filtro" | ✅ | E2E |
| Ações em lote: lista, etiqueta, situação, transferência de responsável, consentimento, exclusão | ✅ | integração + E2E |
| Ficha do contato com campanhas, conversas, negociações e histórico unificado | ✅ | E2E |
| Consentimento LGPD (opt-in exige origem; opt-out com data) | ✅ | integração + E2E |
| Listas: criar, renomear, excluir (sem apagar contatos), membros | ✅ | integração + E2E |
| Etiquetas com cor, vinculadas ao contato central | ✅ | integração + E2E |
| Exportação CSV (Excel pt-BR, proteção contra fórmulas), exige "Exportação de dados" | ✅ | integração + E2E |
| Vendedor vê/edita somente seus contatos; exclusão e transferência só para administrador | ✅ | integração + E2E |
| Limite de contatos do plano | ✅ | integração |

## Infraestrutura
| Item | Status |
|---|---|
| RLS forçado também para o dono das tabelas (0004) — hospedagem com um único usuário de banco | ✅ |
| `render.yaml` (publicação com 1 clique) e `npm run start:prod` (migra + cria admin + inicia) | ✅ preparado, aguardando conta |

## Próximas fases
| Módulo | Status |
|---|---|
| Google Places / Importação | ⏳ Fase 03 |
| Campanhas e scripts | 🔶 tabelas prontas — Fase 04 |
| WhatsApp Cloud API | 🔶 tabelas prontas — Fase 05 |
| Conversas | 🔶 Fase 06 |
| CRM / Equipe (indicadores, distribuição, metas) | 🔶 funil padrão criado automaticamente — Fase 07 |
| Contexto + Chatbot IA | 🔶 `ai_settings` criado por empresa — Fase 08 |
| Dashboard completo, metas, relatórios, exportação | ⏳ Fase 09 |

## Decisões registradas
- Supabase Auth não utilizado (exige e-mail); autenticação própria com login simples.
- Senha mínima: 8 caracteres, sem exigência de símbolos; bloqueio de senhas óbvias e senha = login.
- "Equipe Comercial" é necessária para o admin da empresa gerenciar usuários; sem ela, o admin geral gerencia.
- `users.must_change_password` existe no banco mas ainda não é usado na interface.
