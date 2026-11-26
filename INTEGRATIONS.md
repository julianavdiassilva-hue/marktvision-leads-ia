# INTEGRATIONS.md — APIs externas

Nenhuma integração é simulada. Sem credencial, o módulo informa que a configuração está pendente.
Todas as chaves ficam no `.env` do servidor (nunca no frontend). Tokens por empresa (WhatsApp) ficam criptografados no banco com `ENCRYPTION_KEY`.

## 1. Google Places API (New) — Fase 03
1. https://console.cloud.google.com → crie/seleciona um projeto e ative o **faturamento**.
2. APIs e serviços → Biblioteca → ative **Places API (New)**.
3. Credenciais → Criar credencial → Chave de API. Restrinja a chave à "Places API (New)" (e, em produção, ao IP do servidor).
4. `.env`: `GOOGLE_PLACES_API_KEY=...`
Uso: Text Search (`places:searchText`) com campos nome, telefone, endereço, site, categoria e avaliação. Consumo contado em `usage_counters` (limite `max_google_searches_month`).

## 2. WhatsApp — Meta WhatsApp Business Platform (oficial) — Fase 05
Arquitetura: **cada empresa cliente conecta o próprio número**, sozinha, pelo botão “Conectar WhatsApp” (Embedded Signup oficial).
A Marktvision tem UM app na Meta (credenciais da plataforma); cada empresa recebe o **seu próprio token**, gerado na conexão e guardado criptografado. Não há número fixo nem token compartilhado entre clientes.

### Modalidades (documentação oficial conferida em 26/11/2026)
| Modalidade | Para quem | Como conecta | Observações |
|---|---|---|---|
| **Coexistência** (recomendada) | Quem já usa o app **WhatsApp Business** no celular | Botão “Conectar WhatsApp Business do celular” → informa o número → confirma pelo app (código de verificação) | Continua usando o app no celular; mensagens espelhadas; contatos e até 6 meses de histórico sincronizados (obrigatório em até 24h — automático); limite fixo de 20 mensagens/s; app WhatsApp Business 2.24.17+; grupos, listas de transmissão, mensagens temporárias e de visualização única não suportados pela API; mensagens enviadas pelo app são gratuitas, as enviadas pela API seguem a tabela da Meta |
| **Somente API** | Número novo, fora de qualquer app WhatsApp | Botão “Conectar um número novo” → verificação por SMS/ligação | O número deixa de poder ser usado nos apps WhatsApp |
| **Número pessoal** (app WhatsApp comum) | — | **Não existe método oficial.** | Solução: migrar o número para o WhatsApp Business (gratuito) e usar a coexistência. Integrações não oficiais (QR do WhatsApp Web, Z-API etc.) NÃO foram implementadas: violam os termos do WhatsApp e arriscam bloqueio do número — dependem de sua autorização expressa |

### O que a Marktvision precisa fazer UMA vez (administrador da plataforma)
1. Criar/usar um **Business Portfolio** verificado em https://business.facebook.com (verificação da empresa Marktvision).
2. Em https://developers.facebook.com criar um app do tipo **Empresa** e adicionar o produto **WhatsApp**.
3. Tornar-se **Tech Provider** (Provedor de Tecnologia): no painel do app, WhatsApp → concluir o onboarding de Tech Provider e a **App Review** das permissões `whatsapp_business_management` e `whatsapp_business_messaging` (acesso avançado).
4. **Facebook Login for Business → Configurações → Criar a partir do modelo** “WhatsApp Embedded Signup Configuration With 60 Expiration Token” → copiar o **Configuration ID**.
5. Em Facebook Login for Business, adicionar o domínio da aplicação (ex.: `marktvision-leads-ia.onrender.com`) em *Allowed domains* e *Valid OAuth redirect URIs*.
6. **Webhooks** (WhatsApp → Configuração): URL `https://SEU_DOMINIO/api/webhooks/whatsapp`, token de verificação = `META_WEBHOOK_VERIFY_TOKEN`; assinar os campos `messages`, `smb_message_echoes`, `smb_app_state_sync`, `history` e `account_update`.
7. Variáveis do servidor: `META_APP_ID`, `META_APP_SECRET` (Configurações → Básico), `META_EMBEDDED_SIGNUP_CONFIG_ID`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_API_VERSION=v27.0`, `ENCRYPTION_KEY`, `APP_URL`.

### O que cada empresa cliente faz
1. Entra em **WhatsApp Comercial → Conectar WhatsApp** e segue a janela da Meta (login no Facebook, escolhe/cria o portfólio, informa o número e confirma pelo celular).
2. Adiciona uma **forma de pagamento** no WhatsApp Manager (exigência da Meta para mensagens pagas).
3. Cria/aprova **modelos de mensagem** no WhatsApp Manager e clica em “Sincronizar modelos”.

### O que o sistema faz automaticamente após a conexão
Troca o código (validade 5 min) pelo token da empresa → inscreve o app no WABA → registra o número (exceto coexistência) → solicita sincronização de contatos e histórico (coexistência) → número disponível em campanhas, conversas, chatbot, CRM e relatórios. Desconexão feita pelo cliente no app gera o evento `PARTNER_REMOVED`, e a conexão aparece como “Desconectado” com o botão para reconectar.

### Arquitetura de provedores
`src/server/integrations/whatsapp/provider.ts` define o contrato (`verify`, `sendText`, `sendTemplate`, `listTemplates`, onboarding). A Meta é o provedor `meta_cloud`. Outros provedores **autorizados** podem ser adicionados implementando o contrato, sem alterar campanhas/conversas.

## 3. Inteligência artificial (Anthropic Claude) — Fases 04 e 08
1. https://console.anthropic.com → API Keys → criar chave.
2. `.env`: `ANTHROPIC_API_KEY=...` e `AI_MODEL` (padrão `claude-opus-5-5`).
A IA responde apenas com base no contexto cadastrado da própria empresa.

## 4. Banco de dados
PostgreSQL 16+ local, gerenciado (RDS, Cloud SQL, Neon) ou Supabase. Necessário criar dois papéis (`mv_owner`, `mv_app`) — ver README.
