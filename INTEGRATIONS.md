# INTEGRATIONS.md — APIs externas

Nenhuma integração é simulada. Sem credencial, o módulo informa que a configuração está pendente.
Todas as chaves ficam no `.env` do servidor (nunca no frontend). Tokens por empresa (WhatsApp) ficam criptografados no banco com `ENCRYPTION_KEY`.

## 1. Google Places API (New) — Fase 03
1. https://console.cloud.google.com → crie/seleciona um projeto e ative o **faturamento**.
2. APIs e serviços → Biblioteca → ative **Places API (New)**.
3. Credenciais → Criar credencial → Chave de API. Restrinja a chave à "Places API (New)" (e, em produção, ao IP do servidor).
4. `.env`: `GOOGLE_PLACES_API_KEY=...`
Uso: Text Search (`places:searchText`) com campos nome, telefone, endereço, site, categoria e avaliação. Consumo contado em `usage_counters` (limite `max_google_searches_month`).

## 2. Meta WhatsApp Business Platform (Cloud API) — Fase 05
Plataforma (uma vez, Marktvision):
1. https://developers.facebook.com → Criar app (tipo Empresa) → adicionar produto **WhatsApp**.
2. Anote **App ID** e **App Secret** (Configurações → Básico) → `META_APP_ID`, `META_APP_SECRET`.
3. Defina um texto aleatório em `META_WEBHOOK_VERIFY_TOKEN`.
4. Webhook: URL `https://SEU_DOMINIO/api/webhooks/whatsapp`, token de verificação acima, assinar o campo `messages`. Requer HTTPS público (em desenvolvimento, use um túnel como ngrok/cloudflared).
Por empresa (cada cliente conecta o seu número na tela WhatsApp Comercial):
- **Phone Number ID**, **WhatsApp Business Account ID** e **token de acesso permanente** (usuário do sistema no Business Manager com permissões `whatsapp_business_messaging` e `whatsapp_business_management`).
- Número verificado na Meta; modelos de mensagem aprovados para iniciar conversas fora da janela de 24h.
Regras aplicadas: consentimento (opt-in), descadastramento (opt-out bloqueia envios), modelos aprovados, janela de 24h, limites de envio do número.

## 3. Inteligência artificial (Anthropic Claude) — Fases 04 e 08
1. https://console.anthropic.com → API Keys → criar chave.
2. `.env`: `ANTHROPIC_API_KEY=...` e `AI_MODEL` (padrão `claude-opus-5-5`).
A IA responde apenas com base no contexto cadastrado da própria empresa.

## 4. Banco de dados
PostgreSQL 16+ local, gerenciado (RDS, Cloud SQL, Neon) ou Supabase. Necessário criar dois papéis (`mv_owner`, `mv_app`) — ver README.
