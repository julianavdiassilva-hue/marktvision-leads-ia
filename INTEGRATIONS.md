# INTEGRATIONS.md — APIs externas

Nenhuma integração é simulada. Sem credencial, o módulo informa que a configuração está pendente.
Todas as chaves ficam no `.env` do servidor (nunca no frontend). Tokens por empresa (WhatsApp) ficam criptografados no banco com `ENCRYPTION_KEY`.

## 1. Pesquisa de empresas — Fase 03
**Padrão gratuito: OpenStreetMap (Nominatim)** — sem cadastro e sem custo; traz nome, endereço e site, mas poucas empresas têm telefone. Uso respeitoso (1 consulta por segundo). `SEARCH_PROVIDER=osm`.

**Google Places API (New)** — mais completo (telefone, avaliação). Custos conferidos em 27/11/2026 na tabela oficial do Google Maps Platform: a pesquisa com telefone usa o SKU *Text Search Enterprise* — **1.000 pesquisas grátis por mês** (cada pesquisa traz até 20 empresas); acima disso, cerca de **US$ 35 por 1.000**. Exige conta no Google Cloud **com faturamento (cartão)**. Não ativar sem autorização. Recomenda-se definir cota diária no Console para nunca passar da franquia.
1. https://console.cloud.google.com → crie/seleciona um projeto e ative o **faturamento**.
2. APIs e serviços → Biblioteca → ative **Places API (New)**.
3. Credenciais → Criar credencial → Chave de API. Restrinja a chave à "Places API (New)" (e, em produção, ao IP do servidor).
4. `.env`: `GOOGLE_PLACES_API_KEY=...`
Uso: Text Search (`places:searchText`) com campos nome, telefone, endereço, site, categoria e avaliação. Consumo contado em `usage_counters` (limite `max_google_searches_month`).

## 2A. WhatsApp por QR Code — Evolution API (modalidade ATIVA, não oficial)
Decisão do proprietário da plataforma (26/11/2026): conexão por QR Code via Evolution API, aceitando os riscos da modalidade não oficial.

**Como funciona:** UM servidor Evolution (serviço privado no Render) atende todas as empresas. Ao clicar em “Conectar WhatsApp”, a Marktvision cria uma sessão (instância) exclusiva da empresa, com webhook e segredo próprios, e exibe o QR Code (ou código de pareamento por número). Nenhuma configuração manual por cliente.

**Funciona com:** WhatsApp pessoal e WhatsApp Business (como “aparelho conectado”, igual ao WhatsApp Web). O celular continua funcionando normalmente; mensagens enviadas pelo celular também aparecem no sistema.

**Riscos/limitações (não oficial):** o WhatsApp pode bloquear números que enviam mensagens em massa ou recebem denúncias; não há SLA; mudanças do WhatsApp podem exigir atualizar a versão da Evolution. Mitigações implementadas: intervalo aleatório de 2–6 s entre envios, ritmo padrão de 10/min por número (ajustável), respeito a descadastramento (SAIR) e alerta para enviar só a contatos que autorizaram. Grupos são ignorados.

**Sessões persistentes:** credenciais no PostgreSQL (schema `evolution_api`) + chaves de criptografia no disco persistente `/evolution/instances` (conferido no código-fonte da v2.3.8 — sem esse disco a sessão cairia a cada reinício).

**Infraestrutura (render.yaml — tudo automático):**
| Serviço | Plano | Custo/mês (render.com/pricing, 26/11/2026) |
|---|---|---|
| `marktvision-evolution` (privado, Docker, v2.3.8) | Starter 512 MB + disco 1 GB | US$ 7,00 + US$ 0,25 |
| `marktvision-db` (PostgreSQL 16, Marktvision + Evolution) | Basic-256mb + 1 GB | US$ 6,00 + US$ 0,30 |
| `marktvision-leads-ia` (aplicação) | Free (hiberna sem uso) | US$ 0 — recomendado Starter US$ 7 com clientes ativos |
| **Total inicial** | | **≈ US$ 13,55/mês** (≈ US$ 20,55 com a aplicação Starter) |
Escala: com muitos números conectados, aumentar a Evolution para Standard (2 GB, US$ 25/mês).

**Variáveis (o Blueprint preenche sozinho):** `EVOLUTION_API_HOSTPORT` e `EVOLUTION_API_KEY` (chave gerada automaticamente e compartilhada só pela rede privada). Para usar uma Evolution externa: `EVOLUTION_API_URL` + `EVOLUTION_API_KEY`. A URL pública da aplicação (`RENDER_EXTERNAL_URL`/`APP_URL`) é usada nos webhooks.

**Alternativa de hospedagem (se não usar o Render):** qualquer VPS com Docker (ex.: 2 GB RAM) rodando `infra/evolution/Dockerfile` + PostgreSQL; o Render atende todos os requisitos, por isso é o recomendado.

## 2B. WhatsApp — Meta WhatsApp Business Platform (oficial) — alternativa futura
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

## 3. Inteligência artificial — Fases 04 e 08
Configurar pelo `CONFIGURAR_IA.bat` (grava no `.env`, nunca no código). Opções (conferidas em 27/11/2026; limites podem mudar — confira a página oficial):
| Opção | Custo | Observações |
|---|---|---|
| **Google Gemini** (aistudio.google.com, modelo `gemini-2.5-flash`) | Franquia gratuita com limites por minuto/dia, sem cartão | Na franquia gratuita o Google **pode usar os dados enviados para melhorar produtos**. Não vincular faturamento ao projeto (vincular faz todo o uso ser cobrado). |
| **Groq** (console.groq.com, `llama-3.3-70b-versatile`) | Franquia gratuita sem cartão (cerca de 1.000 pedidos/dia nesse modelo) | Rápido; bom para testes. |
| **Ollama local** (`qwen2.5:3b`) | Gratuito, roda no próprio computador | Privado; mais lento; ~2 GB de download; exige memória livre. |
| **Anthropic Claude** (`claude-opus-5-5`) | **Pago por uso** | Melhor qualidade; só com autorização. |
A IA responde apenas com base no contexto cadastrado da própria empresa.

## 4. Banco de dados
PostgreSQL 16+ local, gerenciado (RDS, Cloud SQL, Neon) ou Supabase. Necessário criar dois papéis (`mv_owner`, `mv_app`) — ver README.
