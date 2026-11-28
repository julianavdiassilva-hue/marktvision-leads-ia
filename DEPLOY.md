# Publicação na internet com domínio próprio

Levantamento feito em 28/11/2026. Preços em moeda estrangeira variam com o câmbio. Confira o valor final no checkout antes de contratar.
**Nada foi contratado.** Qualquer serviço pago depende da sua autorização.

---

## 1. O que o sistema precisa (análise da arquitetura)

| Parte | O que é | O que exige da hospedagem |
|---|---|---|
| Aplicação (telas + servidor) | Next.js 16 / Node 22, autenticação própria, fila de tarefas interna (campanhas, IA, webhooks) | Processo **sempre ligado**. A fila e os disparos param se o servidor "dormir" |
| Banco de dados | PostgreSQL 16 com RLS (isolamento por empresa em duas camadas) | Disco persistente e backups. Nunca exposto à internet |
| WhatsApp por QR Code | Evolution API v2.3.8 (uma sessão por número conectado) | Processo sempre ligado + **disco persistente** para as sessões. Se reiniciar sem disco, todos os números precisam ler o QR de novo |
| WhatsApp oficial (Meta) | Alternativa futura | Endereço público **HTTPS** para o webhook (`/api/webhooks/whatsapp`) |
| Arquivos (logomarcas) | Guardados no próprio banco | Nada extra |
| IA / pesquisa | Gemini, Groq, Ollama ou Anthropic; OpenStreetMap ou Google | Acesso à internet de saída e chaves no `.env` |

**Conclusão:** precisa de um **servidor de verdade, ligado 24 h, com disco**. Por isso ficam de fora:
- **Vercel, Netlify** e similares, que funcionam por funções que desligam: não rodam a Evolution nem a fila.
- **Plano gratuito do Render**: desliga após inatividade. O plano pago fica em cerca de US$ 20+/mês (aplicação + Evolution com disco + banco), o que é caro para testes.

O projeto já roda tudo junto com Docker Compose, o mesmo conjunto usado no seu computador. Ele foi testado aqui como servidor: HTTPS, 3 vendedores simultâneos, queda e recuperação automática, backup e restauração.

## 2. Opções e custos

| Opção | Custo | Prós | Contras |
|---|---|---|---|
| **A. Seu computador + Cloudflare Tunnel + domínio** | **Só o domínio: cerca de R$ 40/ano** (Registro.br). Cloudflare: plano gratuito | Já está pronto (`ACESSO_REMOTO.bat`, opção 2). HTTPS automático. Não abre portas no roteador | O sistema só funciona com o computador ligado e com internet/energia estáveis |
| **B. Servidor VPS + domínio** (recomendado para funcionamento 24 h) | VPS de 4 GB de RAM: **cerca de R$ 25 a 48/mês** (ex.: Hostinger KVM 1, com servidor no Brasil; preço promocional mais baixo em contratos longos, renovação maior) + domínio R$ 40/ano | Independe do seu computador. Mesmo programa e scripts. Dados no Brasil | Custo mensal |
| B2. Hetzner CAX11 (Europa) | cerca de € 6,49/mês | Bom preço | Os planos mais baratos apareceram **indisponíveis para compra** em set–out/2026 e os preços subiram em 2026. Servidor fora do Brasil |
| B3. Oracle Cloud "Always Free" | R$ 0 | Gratuito | **Exige cartão** (verificação). Os recursos gratuitos foram reduzidos em 2026. A Oracle pode **recuperar instâncias consideradas ociosas**, o que é arriscado para sessões de WhatsApp. Não recomendado |

**Recomendação para a fase de testes com o menor custo:**
1. **Agora:** opção **A**. O único gasto é o domínio, cerca de R$ 40/ano. O endereço fica fixo e com HTTPS.
2. **Quando precisar ficar no ar 24 h sem depender do seu computador:** opção **B** (VPS Linux Ubuntu 24.04 com 4 GB de RAM; 2 GB é o mínimo). Só contrate com a sua autorização.
3. O domínio e os dados passam de A para B sem perda (seção 8).

## 3. Contas a criar

| Conta | Para quê | Custo | Opção |
|---|---|---|---|
| **Registro.br** (registro.br) | Registrar o domínio `.com.br` (exige CPF ou CNPJ) | cerca de R$ 40/ano | A e B |
| **Cloudflare** (dash.cloudflare.com) | DNS + túnel seguro + HTTPS | Gratuito | A (opcional em B) |
| **Provedor de VPS** (ex.: Hostinger) | O servidor 24 h | cerca de R$ 25 a 48/mês | B |
| GitHub | Já existe (código do sistema) | Gratuito | A e B |

Sugestão de endereço: `app.seudominio.com.br` para o sistema (o site institucional pode usar o domínio principal).

## 4. Registros DNS

### Opção A: Cloudflare Tunnel (computador)
1. **Registro.br** → seu domínio → **Alterar servidores DNS** → coloque os **2 servidores que a Cloudflare indicar** (ex.: `xxx.ns.cloudflare.com` e `yyy.ns.cloudflare.com`).
2. **Cloudflare** → Zero Trust → Networks → **Tunnels** → Create a tunnel (Cloudflared) → copie o **token**.
3. No túnel, em **Public Hostname**: subdomínio `app`, domínio `seudominio.com.br`, serviço `HTTP` → `app:3000`.
   A Cloudflare cria sozinha o registro:

| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| CNAME | `app` | `<id-do-túnel>.cfargotunnel.com` | Ativado (nuvem laranja) |

4. No computador: `ACESSO_REMOTO.bat` → opção **2** → cole o token e `https://app.seudominio.com.br`.

### Opção B: VPS com HTTPS direto (Let's Encrypt)
No **Registro.br** (DNS do próprio Registro.br, em "Editar zona"):

| Tipo | Nome | Valor | Obrigatório |
|---|---|---|---|
| **A** | `app` | IP público IPv4 do VPS (ex.: `203.0.113.10`) | **Sim** |
| AAAA | `app` | IPv6 do VPS | Só se o VPS tiver IPv6 |
| CAA | `app` | `0 issue "letsencrypt.org"` | Opcional (restringe quem emite certificado) |

O certificado HTTPS é emitido sozinho alguns minutos depois que o DNS propagar, e é renovado automaticamente.
Também é possível usar a opção B com Cloudflare Tunnel (DNS da opção A). O instalador pergunta qual modo usar.

## 5. Instalação no VPS (opção B)
1. Crie o VPS com **Ubuntu 24.04**. Se possível, cadastre sua **chave SSH** em vez de senha.
2. Crie o registro DNS **A** (seção 4).
3. Entre no servidor (`ssh root@IP`) e rode:
```bash
git clone https://github.com/julianavdiassilva-hue/marktvision-leads-ia.git /opt/marktvision
```
```bash
cd /opt/marktvision && sudo ./servidor.sh instalar
```
O instalador:
- instala o Docker;
- cria 2 GB de memória de reserva se o servidor tiver pouca RAM;
- configura o firewall: só SSH, 80 e 443 ficam abertos;
- **gera senhas exclusivas** no `.env`, com permissão 600;
- pergunta o domínio, confere o DNS, monta e inicia tudo;
- cria o **administrador geral**. Não existe senha padrão.

| Comando | Para quê |
|---|---|
| `sudo ./servidor.sh status` | Serviços, último backup, disco, DNS |
| `sudo ./servidor.sh backup` / `restaurar` | Backup imediato / voltar um backup |
| `sudo ./servidor.sh atualizar` | Nova versão do GitHub (backup antes, dados preservados) |
| `sudo ./servidor.sh admin` | Criar ou redefinir a senha do administrador geral |
| `sudo ./servidor.sh dominio` | Trocar domínio ou modo (HTTPS direto ↔ Cloudflare Tunnel) |
| `sudo ./servidor.sh definir AI_API_KEY valor` | Configurar integrações e reiniciar |
| `sudo ./servidor.sh logs` | Acompanhar os registros da aplicação |

## 6. Variáveis de ambiente (`.env` do servidor, nunca no código)
| Variável | Origem |
|---|---|
| `DB_OWNER_PASSWORD`, `DB_APP_PASSWORD`, `EVOLUTION_API_KEY`, `ENCRYPTION_KEY`, `META_WEBHOOK_VERIFY_TOKEN` | **Geradas automaticamente** (aleatórias, únicas) |
| `DOMINIO`, `APP_URL`, `MODO_PUBLICACAO`, `CLOUDFLARE_TUNNEL_TOKEN` | Perguntadas pelo instalador |
| `APP_BIND=127.0.0.1`, `COOKIE_SECURE=true` | Fixas no servidor: a aplicação só é acessível pelo HTTPS |
| `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `ANTHROPIC_API_KEY` | Opcionais: IA (ver `INTEGRATIONS.md`) |
| `SEARCH_PROVIDER`, `GOOGLE_PLACES_API_KEY` | Opcionais: pesquisa (OpenStreetMap gratuito por padrão) |
| `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID` | Opcionais: WhatsApp oficial (futuro) |

## 7. Integrações externas com domínio próprio
- **WhatsApp por QR Code (Evolution):** nada a configurar. As mensagens recebidas chegam pela rede interna do servidor e nunca passam pela internet. Cada empresa conecta os números em **WhatsApp Comercial**.
- **WhatsApp oficial (Meta), futuro:** no app da Meta, use o webhook `https://app.seudominio.com.br/api/webhooks/whatsapp` com o token `META_WEBHOOK_VERIFY_TOKEN`, e cadastre o domínio em "Domínios do app".
- **Google Places (se autorizar o custo):** restrinja a chave ao IP do VPS no Google Cloud Console.
- **IA:** sem mudanças; as chamadas saem do servidor.

## 8. Levar os dados do computador para o VPS (sem perder nada)
1. No computador: `BACKUP_MARKTVISION.bat` e depois `PARAR_MARKTVISION.bat`. **Não use os dois ao mesmo tempo**: o mesmo número de WhatsApp não pode ficar ativo em dois servidores.
2. Copie do `.env` do computador as linhas `ENCRYPTION_KEY` e `EVOLUTION_API_KEY` para o `.env` do servidor. Sem a mesma chave, os tokens criptografados não abrem. Depois rode `sudo ./servidor.sh reiniciar`.
3. Envie os arquivos `banco_*.dump` e `sessoes_whatsapp_*.tar.gz` para `/opt/marktvision/backups/manual/` (com WinSCP ou `scp`).
4. `sudo ./servidor.sh restaurar` → escolha o backup → `RESTAURAR`.

## 9. Segurança e isolamento (o que vale na internet)
- **Exposto:** apenas o HTTPS (porta 443; a porta 80 só redireciona). Banco de dados, Evolution API e a porta 3000 não são acessíveis de fora (testado).
- **HTTPS** com HSTS, cookies de sessão `Secure` + `HttpOnly`, CSP e anti-iframe.
- **Isolamento entre empresas:** filtro por empresa em todos os serviços + **RLS** no PostgreSQL. O usuário de banco da aplicação não tem superpoderes.
- **Login:** senhas com bcrypt; bloqueio após tentativas erradas usando o **IP real**. Um IP falsificado no cabeçalho é ignorado (testado).
- **Segredos** só no `.env` (permissão 600), gerados no próprio servidor.
- **Recomendações para você:**
  - use chave SSH e desative o login SSH por senha;
  - use uma senha forte para o administrador geral;
  - guarde cópias dos backups fora do servidor.
- O repositório no GitHub está **público**: o código pode ser visto, mas não contém senhas nem dados. Se preferir torná-lo privado, o servidor precisará de uma "deploy key" (chave de leitura) para atualizar.

## 10. Funcionamento contínuo
- Todos os serviços reiniciam sozinhos se o processo cair (testado com uma queda forçada) e quando o servidor reinicia (o Docker inicia com o sistema).
- Verificações de saúde automáticas na aplicação, no banco e na Evolution.
- **Backup automático diário às 03h** (banco + sessões do WhatsApp, 14 dias) em `/opt/marktvision/backups`. Para se proteger contra falha do disco do VPS, copie a pasta periodicamente para o seu computador, ou contrate o backup/snapshot do provedor (custo extra, só com autorização).
- Acesso simultâneo: cada vendedor entra de qualquer computador ou celular pelo endereço `https://app.seudominio.com.br/entrar/<empresa>`.

## Fontes de preços (consultadas em 28/11/2026)
Hetzner (ajuste de preços 2026): docs.hetzner.com/general/infrastructure-and-availability/price-adjustment · Oracle Always Free: docs.oracle.com/iaas/Content/FreeTier/resourceref.htm · Hostinger VPS: hostinger.com/br/servidor-vps · Registro.br: registro.br.
