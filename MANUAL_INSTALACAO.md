# Marktvision Leads IA — Manual de instalação e uso no seu computador (Windows)

Este manual coloca o sistema funcionando no **seu computador**, que passa a ser o servidor. Os vendedores usam **só o navegador** (Chrome, Edge…), sem instalar nada.

---

## 1. O que você precisa
| Item | Mínimo | Recomendado |
|---|---|---|
| Windows | 10 ou 11, 64 bits | Windows 11 |
| Memória (RAM) | 8 GB | 16 GB |
| Espaço livre em disco | 20 GB | 40 GB |
| Virtualização | ativada na BIOS (o instalador do Docker avisa se não estiver) | — |
| Internet | necessária para o WhatsApp e acesso remoto | cabo de rede |

Programas gratuitos usados (o instalador cuida deles): **Docker Desktop** (gratuito para uso pessoal e pequenas empresas — consulte os termos em docker.com/pricing) e **Git**.

> O computador servidor precisa ficar **ligado e com o Windows aberto (usuário logado)** enquanto os vendedores trabalham. Configure o Windows para **não entrar em suspensão**: Configurações → Sistema → Energia → "Suspender" = Nunca (quando conectado à energia).

---

## 2. Instalação (uma única vez)
1. No GitHub, abra o repositório `julianavdiassilva-hue/marktvision-leads-ia` → botão verde **Code** → **Download ZIP**.
2. **Extraia o ZIP inteiro antes de executar qualquer arquivo** — não abra o `INSTALAR.bat` de dentro do ZIP (o Windows/WinRAR copia só aquele arquivo para uma pasta temporária e a instalação falha):
   - Windows: clique com o botão direito no ZIP → **Extrair tudo...** → destino `C:\Marktvision` → **Extrair**.
   - WinRAR: botão direito no ZIP → **Extrair para...** → `C:\Marktvision` → OK.
   - Será criada a pasta `C:\Marktvision\marktvision-leads-ia-main`, com o `INSTALAR.bat` e as pastas `infra`, `src` etc.
3. Abra a pasta extraída e dê **dois cliques em `INSTALAR.bat`**.
   - Se o Docker Desktop não estiver instalado, ele será instalado. **Reinicie o computador**, abra o Docker Desktop uma vez (aceite os termos; não é preciso criar conta) e rode `INSTALAR.bat` de novo.
   - Pode aparecer uma janela de login do GitHub: entre com a sua conta (serve para receber atualizações).
   - A primeira montagem leva de **5 a 15 minutos**.
4. O instalador pede o **login e a senha do administrador geral** (a senha não aparece enquanto você digita). Não há senha padrão: só existe a que você criar.
5. Ele pede permissão de administrador do Windows para liberar o acesso da rede local no Firewall — clique em **Sim**.
6. Responda se quer que o sistema **inicie sozinho ao ligar o computador** (recomendado: S).
7. Ao final aparecem os **endereços de acesso** (também salvos no arquivo `ENDERECOS.txt`).

As senhas internas (banco de dados, servidor do WhatsApp, chave de criptografia) são **geradas automaticamente**, únicas para o seu computador, e ficam no arquivo `.env`, acessível só pelo seu usuário do Windows. **Não compartilhe nem apague o `.env`.**

---

## 3. Uso no dia a dia (dois cliques)
| Arquivo | Para que serve |
|---|---|
| `INICIAR_MARKTVISION.bat` | Liga o sistema e mostra os endereços |
| `PARAR_MARKTVISION.bat` | Desliga (os dados continuam salvos) |
| `REINICIAR_MARKTVISION.bat` | Reinicia todos os serviços |
| `VER_STATUS.bat` | Situação dos serviços, último backup e erros recentes |
| `BACKUP_MARKTVISION.bat` | Faz um backup imediato |
| `RESTAURAR_BACKUP.bat` | Volta os dados de um backup |
| `ATUALIZAR_MARKTVISION.bat` | Instala a versão mais nova (faz backup antes) |
| `CRIAR_ADMIN.bat` | Cria ou redefine a senha do administrador geral |
| `ACESSO_REMOTO.bat` | Liga/desliga o acesso pela internet |
| `INICIO_AUTOMATICO.bat` | Liga/desliga o início junto com o Windows |

---

## 4. Endereços de acesso
- **Neste computador:** `http://localhost:3000`
- **Rede local (mesmo Wi-Fi ou cabo):** `http://IP-DO-COMPUTADOR:3000` — o IP aparece no `ENDERECOS.txt` (ex.: `http://192.168.0.15:3000`).
  Dica: no roteador, reserve um IP fixo para o computador servidor ("reserva DHCP"), assim o endereço não muda.
- **Internet (vendedores em outros locais):** veja a seção 5.

Todos os vendedores usam **o mesmo banco de dados**: o que um cadastra aparece para os outros (conforme as permissões) na hora, ao abrir ou atualizar a tela.

---

## 5. Acesso pela internet (Cloudflare Tunnel — seguro, sem abrir portas no roteador)
Somente a tela do sistema fica acessível, sempre com **HTTPS**. Banco de dados, servidor do WhatsApp e senhas **nunca** ficam expostos.

### Opção A — Endereço temporário (gratuito, sem cadastro)
`ACESSO_REMOTO.bat` → opção **1**. Aparece um endereço como `https://palavras-aleatorias.trycloudflare.com`.
- ✅ Gratuito e imediato.
- ⚠️ **O endereço muda sempre que o sistema reinicia**; é preciso reenviar aos vendedores (está no `ENDERECOS.txt`).
- ⚠️ A Cloudflare oferece esse modo para testes, sem garantia de disponibilidade (limite de 200 acessos simultâneos — suficiente para 3 vendedores).
- 🔒 Mesmo com o endereço público, cada vendedor só entra com login e senha; o sistema bloqueia tentativas repetidas de senha.

### Alternativa gratuita sem endereço público: Tailscale
Cria uma rede privada entre o computador servidor e os celulares/computadores dos vendedores (o sistema não fica visível na internet). Plano gratuito *Personal*: até 6 usuários. **Atenção:** a Tailscale declara o plano gratuito apenas para uso **não comercial** — serve para os testes; para uso comercial contínuo, o plano pago ou o endereço fixo (Opção B) é o adequado. Cada vendedor instala o aplicativo Tailscale e entra com a conta convidada; o endereço fica `http://NOME-DO-COMPUTADOR:3000`.

### Opção B — Endereço fixo (recomendado para uso contínuo)
Exige **um domínio próprio** (ex.: `marktvision.com.br`). Custo: **cerca de R$ 40 por ano** no registro.br (único custo; a Cloudflare e o túnel são gratuitos).
1. Registre o domínio (registro.br) e crie uma conta gratuita na Cloudflare; adicione o domínio na Cloudflare e troque os servidores DNS no registro.br conforme a Cloudflare indicar.
2. Na Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel** (tipo *Cloudflared*), dê um nome e copie o **token** exibido.
3. Em **Public Hostname**, adicione por exemplo `app.seudominio.com.br` apontando para o serviço `http://app:3000`.
4. Rode `ACESSO_REMOTO.bat` → opção **2**, cole o token e o endereço `https://app.seudominio.com.br`.

---

## 5.1 Inteligência artificial e pesquisa de empresas (opções gratuitas)
**IA** — rode `CONFIGURAR_IA.bat` e escolha:
1. **Google Gemini** — gratuito com limites; crie a chave em aistudio.google.com (conta Google, sem cartão). Na franquia gratuita o Google pode usar os textos enviados para melhorar produtos.
2. **Groq** — gratuito com limites; chave em console.groq.com (sem cartão).
3. **Ollama** — gratuito e privado, roda no seu computador (mais lento; baixa ~2 GB).
4. **Anthropic Claude** — pago por uso (somente se você autorizar).

Depois teste em **Chatbot IA → Testar o agente**. Sem IA configurada, o sistema funciona normalmente e as conversas ficam com os vendedores.

**Pesquisa de empresas** — por padrão usa o **OpenStreetMap** (gratuito; poucas empresas têm telefone). O **Google** é mais completo (1.000 pesquisas grátis/mês, depois cerca de US$ 35 por 1.000) mas exige cartão no Google Cloud — só ative com `CONFIGURAR_PESQUISA.bat` se decidir pagar eventual excedente.

---

## 6. Primeiro acesso e cadastro dos vendedores
1. Entre com o **administrador geral** → menu **Empresas** → **Nova empresa** (só o nome é obrigatório).
2. Na mesma tela, em **Acessos da empresa**, adicione o administrador da empresa e os **3 vendedores** (nome, login, senha, tipo "Vendedor").
3. Abra a empresa (menu **Empresas** → nome da empresa) e, em **Funcionalidades liberadas**, ligue os módulos que serão usados — por exemplo **Campanhas**, **WhatsApp Comercial**, **Chatbot IA** e **Exportação de dados**. O menu de cada usuário muda na hora.
4. Entregue a cada vendedor: **endereço**, **login** e **senha**. No primeiro acesso, cada um pode trocar a própria senha em **Configurações**.
5. Permissões individuais: **Usuários** (ou **Equipe Comercial**, pelo administrador da empresa) → clique no vendedor → **Permissões individuais**.

Cada vendedor vê somente os próprios contatos, conversas e negociações; o administrador da empresa vê tudo da empresa; empresas diferentes nunca veem dados umas das outras.

---

## 6.1 Identidade visual de cada empresa (White Label)
1. Administrador geral: **Empresas** → nome da empresa → aba **Identidade Visual**.
2. Envie a **logomarca** (PNG, JPG ou WEBP, até 1 MB — de preferência PNG com fundo transparente), escolha as **cores** (seletor ou código como `#008C48`) e o **nome exibido**. A pré-visualização muda na hora.
3. Clique em **Salvar personalização**. Todos os usuários da empresa passam a ver a nova identidade na próxima tela que abrirem. **Restaurar padrão original** volta ao visual Marktvision.
4. Cada empresa tem uma **tela de login própria**: `http://ENDERECO/entrar/nome-da-empresa` (o endereço aparece na aba, com botão **Copiar**). Envie aos vendedores.
5. Para o administrador da empresa personalizar sozinho: ligue **Identidade visual** em **Funcionalidades liberadas**. O item aparece no menu dele.
- Combinações ilegíveis (texto claro em fundo claro, fundo escuro etc.) são bloqueadas com a explicação. Textos dos botões e do menu se ajustam automaticamente.
- O painel do administrador geral sempre mantém o visual Marktvision.

---

## 7. Conectar o WhatsApp por QR Code
1. Entre como administrador da empresa → **WhatsApp Comercial** → **Conectar WhatsApp**.
2. Dê um nome (ex.: "Comercial") → **Gerar QR Code**.
3. No celular: WhatsApp → **⋮ / Configurações → Aparelhos conectados → Conectar um aparelho** → aponte para o QR Code. (Ou use "conectar com código pelo número".)
4. Em segundos aparece **"WhatsApp conectado!"**. Defina os **vendedores responsáveis** pelo número no mesmo cartão.
- Funciona com **WhatsApp pessoal e WhatsApp Business**; o celular continua funcionando normalmente.
- Mais de um número: repita o processo. Trocar número: **Desconectar/Excluir** e conectar o novo. Reconectar: **Gerar novo QR Code** no cartão do número.

### Riscos da conexão não oficial (leia)
- O WhatsApp **pode bloquear** números que enviam muitas mensagens, para desconhecidos, ou que recebem denúncias. O sistema espaça os envios (2–6 s entre mensagens, 10 por minuto por número, ajustável) e respeita quem responde **SAIR**, mas o risco não é zero.
- Envie apenas para contatos que **autorizaram** receber mensagens (LGPD).
- Não há garantia de funcionamento: mudanças do WhatsApp podem exigir atualizar o sistema (`ATUALIZAR_MARKTVISION.bat`).
- O celular precisa entrar na internet pelo menos a cada 14 dias para manter o aparelho conectado.
- A integração **oficial da Meta** continua disponível no sistema como alternativa futura (sem risco de bloqueio por uso da API, mas com custos por mensagem e cadastro na Meta).

---

## 8. Backups e recuperação
- **Automático:** todos os dias às 03h (e na primeira execução), na pasta `C:\Marktvision\backups\automatico` — banco de dados completo + sessões do WhatsApp. Mantém os últimos 14 dias.
- **Manual:** `BACKUP_MARKTVISION.bat` (pasta `backups\manual`).
- **Proteja os backups:** copie a pasta `backups` periodicamente para um **pendrive ou nuvem**. Se o computador estragar, é isso que salva os dados.
- **Restaurar:** `RESTAURAR_BACKUP.bat` → escolha o backup → digite `RESTAURAR`. Um backup do estado atual é feito antes, por segurança.
- Os backups contêm senhas apenas em formato criptografado (hash) e tokens criptografados.

---

## 9. Queda de energia e reinício do computador
- Com o **início automático** ativado, ao ligar o computador e entrar no Windows, o Docker e o sistema sobem sozinhos (1 a 3 minutos).
- Os dados ficam em armazenamento permanente do Docker: **nada se perde** ao desligar, reiniciar ou atualizar (o que estava sendo digitado no exato momento da queda pode não ser salvo).
- As sessões do WhatsApp ficam salvas e reconectam sozinhas; se o WhatsApp tiver desconectado o aparelho, gere um novo QR Code.
- Opcional: na BIOS do computador, a opção "Restore on AC Power Loss = Power On" liga o computador sozinho quando a energia volta.

---

## 10. Atualizações
Quando houver versão nova (desenvolvida e enviada ao GitHub), dê dois cliques em `ATUALIZAR_MARKTVISION.bat`:
1. faz **backup automático**; 2. baixa a nova versão; 3. aplica as **migrações do banco** (sem apagar dados); 4. reinicia.
Se algo der errado, nada é alterado e a mensagem explica o motivo.

---

## 11. Migração futura para hospedagem profissional
O sistema é o mesmo em qualquer lugar (Docker). Para migrar: faça um backup (`BACKUP_MARKTVISION.bat`), crie o servidor profissional (ex.: Render — arquivo `render.yaml` pronto; ou uma VPS com Docker usando este mesmo `docker-compose.yml`), restaure o arquivo `banco_*.dump` e as sessões. Empresas, usuários, contatos, campanhas, conversas e vendas são preservados.

---

## 12. Problemas comuns
| Situação | O que fazer |
|---|---|
| "Docker Desktop não respondeu" | Abra o Docker Desktop, espere ficar verde, rode `INICIAR_MARKTVISION.bat` |
| Vendedor da rede local não acessa | Confira o IP no `ENDERECOS.txt`; rode `INSTALAR.bat` de novo para liberar o Firewall; computador e vendedor devem estar na mesma rede |
| Endereço da internet parou | Endereço temporário muda a cada reinício: veja o novo no `ENDERECOS.txt` |
| WhatsApp desconectado | WhatsApp Comercial → **Gerar novo QR Code** |
| Esqueci a senha do administrador | `CRIAR_ADMIN.bat` com o mesmo login redefine a senha |
| Qualquer outro problema | `VER_STATUS.bat` mostra serviços e erros; o histórico fica em `logs\operacao.log` |
