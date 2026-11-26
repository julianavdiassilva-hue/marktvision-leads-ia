# DATABASE.md — Estrutura do banco de dados

PostgreSQL 16. Migrações em `db/migrations` (aplicadas por `npm run db:migrate`, registradas em `schema_migrations`).
Papéis: `mv_owner` (dono do schema, migrações) e `mv_app` (aplicação, sujeito a RLS).

## Contexto de segurança (por transação)
`app.company_id`, `app.user_id`, `app.platform_admin`, `app.system` → funções `app_company_id()`, `app_user_id()`, `app_bypass()`.
Política padrão das tabelas comerciais: `company_id = app_company_id() OR app_bypass()` (leitura e escrita).

## 0001 — Núcleo
| Tabela | Função | Chaves/regras |
|---|---|---|
| features | Catálogo das 18 funcionalidades | PK key |
| plans | Planos + `limits` (jsonb) | nome único |
| plan_features | Funcionalidades do plano | PK (plan_id, feature_key) |
| companies | Empresas (só `name` obrigatório) | plan_id FK, `limits_override`, is_active |
| company_features | Liberação/bloqueio individual da empresa | PK (company_id, feature_key) |
| users | Usuários; login `username` (citext, único, regex) | bcrypt em password_hash |
| company_memberships | Vínculo usuário↔empresa + perfil (`company_admin`/`seller`) | único (company_id, user_id) |
| user_feature_overrides | Permissões individuais | PK (company_id, user_id, feature_key) |
| sessions | Sessões; `token_hash` SHA-256; empresa ativa | expira em 30 dias (renovação deslizante) |
| login_attempts | Proteção contra força bruta (8 falhas/15 min) | só acesso de sistema |
| audit_logs | Auditoria | por empresa |

## 0002 — Domínio comercial (todas com company_id + RLS)
| Tabela | Relações principais | Regras anti-duplicidade |
|---|---|---|
| contacts | owner_user_id→users | únicos por empresa: phone_e164, whatsapp_e164, google_place_id; origem, consentimento (opted_in/out) |
| contact_lists / contact_list_members | lista↔contato | nome de lista único; PK (list_id, contact_id) |
| tags / contact_tags / tag_rules | etiqueta↔contato | nome único; PK (contact_id, tag_id) |
| scripts | modelos de mensagem | |
| whatsapp_connections / whatsapp_templates | provedor `meta_cloud`, token criptografado | phone_number_id único |
| campaigns | list, script, whatsapp, template; `number` sequencial por empresa; status; `response_mode` | único (company_id, number) |
| campaign_contacts | campanha↔contato com status de envio | **único (campaign_id, contact_id)** → sem envio duplicado |
| conversations | contato, conexão, vendedor, campanha de origem, `ai_enabled`, `handled_by`, janela 24h | única por (empresa, contato, conexão) |
| messages | conversa, contato, campanha; direção, remetente (contato/usuário/IA/campanha), status | provider_message_id único (idempotência de webhook) |
| quick_replies | respostas rápidas | atalho único |
| pipelines / pipeline_stages | funil personalizável; etapas `open/won/lost` | 1 funil padrão por empresa (criado por trigger) |
| opportunities | contato, etapa, vendedor, campanha, conversa, valor, próximo retorno | |
| sales | oportunidade, contato, vendedor, campanha, valor | 1 venda por oportunidade |
| goals | meta individual (user_id) ou coletiva (null) | período válido |
| knowledge_entries / knowledge_documents | contexto da empresa | |
| ai_settings | configuração do agente (1 por empresa, criada por trigger) | |
| jobs | fila (pending/running/done/failed), `dedupe_key` | dedupe único enquanto pendente |
| domain_events | linha do tempo/eventos para relatórios | |
| webhook_events | payload bruto recebido (auditoria/reprocessamento) | só sistema |
| usage_counters | consumo mensal (mensagens, pesquisas) para limites | PK (empresa, métrica, mês) |

## 0004 — RLS forçado
`FORCE ROW LEVEL SECURITY` em todas as tabelas com RLS: o isolamento vale mesmo quando a aplicação usa o usuário dono das tabelas (hospedagens com um único usuário). Migrações e seed rodam com `app.system = on`.

## 0005–0007 — WhatsApp
- `whatsapp_connections`: `settings` (ritmo/minuto), `quality_rating`, `connection_mode` (cloud_api | coexistence | manual), `business_id`, `register_pin_encrypted`, `onboarding` (sincronizações da coexistência).
- `whatsapp_connection_members`: vendedores responsáveis por número (RLS).
- `contacts.wa_user_id`: identificador do usuário no WhatsApp (BSUID), único por empresa — contatos podem chegar sem telefone.
- `messages.channel` (api | business_app | history) e `template_name`.
- `webhook_events.attempts`: reprocessamento automático.

## Triggers
- `set_updated_at` em tabelas editáveis.
- `create_default_pipeline` (após inserir empresa): funil com 9 etapas (Novo lead … Venda realizada, Perdido) + `ai_settings`.

## Comandos
```
npm run db:migrate   # aplica migrações pendentes
npm run db:seed      # cria o administrador geral
npm run db:reset     # APAGA e recria (somente dev/teste)
```
