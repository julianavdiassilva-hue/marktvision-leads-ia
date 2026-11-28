# TESTING.md — Cenários e resultados

Comandos:
```
npm test            # integração (Vitest) — reseta o banco de TESTES
npm run build && npm run test:e2e   # navegador real (Playwright/Chromium), banco de TESTES, porta 3100
```
Os testes nunca usam o banco de desenvolvimento (`TEST_DATABASE_*`).

## Fase 01 — Integração (26 cenários) — ✅ 26/26 (26/11/2026)
- Empresa só com nome (plano Completo padrão); nome vazio rejeitado em português.
- Empresa + admin + 2 vendedores numa transação; acesso inválido → nada gravado.
- Login por usuário (case-insensitive) de cada perfil; senha errada/inexistente → mesma mensagem.
- Senha fraca rejeitada; hash bcrypt (custo 12) e token de sessão SHA-256 verificados no banco.
- Permissões: padrão do vendedor; admin com 18; bloqueio/liberação por empresa; exceção removida ao igualar o plano.
- Permissão individual concede/retira; não ultrapassa o contrato da empresa.
- Isolamento: admin da empresa B não lista/edita/redefine/desativa usuários da A; RLS bloqueia SELECT/INSERT/UPDATE cruzado via SQL direto.
- Vendedor bloqueado em empresas, usuários, planos e plataforma.
- Desativar empresa/usuário invalida sessões e login; não pode desativar a si mesmo.
- Reset de senha derruba sessões; troca da própria senha exige a atual.
- Força bruta: bloqueio após 8 falhas em 15 min.
- Logout invalida token; token forjado rejeitado.
- Admin geral entra no ambiente de uma empresa; admin de empresa não troca para outra.
- Plano personalizado com limite de vendedores; exceção de limite por empresa; plano em uso não pode ser excluído; login duplicado rejeitado.

## Fase 01 — E2E navegador (15 cenários) — ✅ 15/15
Login inválido · redirecionamento sem sessão · admin geral · empresa só com nome · empresa + 3 acessos · bloqueio de Campanhas/WhatsApp persistido · menu do admin da empresa · **acesso por URL bloqueado com HTTP 307** (/campanhas, /whatsapp, /admin/*) · cadastro de vendedor pela equipe · retirada individual do CRM · menu e URLs do vendedor · isolamento por URL entre empresas (404) · seletor de ambiente · desativação de empresa bloqueia login · celular 390 px sem rolagem horizontal.
Capturas: `docs/screenshots/`.

## Fase 02 — Integração (13 cenários) — ✅ (total acumulado 39/39)
Contato só com telefone (E.164) · validações em português · duplicado em formatos diferentes bloqueado · upsert sem duplicar e completando campos · vendedor só vê/edita os seus · transferência só por admin + histórico · listas sem duplicar membros, excluir lista mantém contatos · etiquetas e filtro · consentimento opt-in/opt-out · CSV com BOM e proteção contra fórmulas, bloqueado sem "Exportação de dados" · limite de contatos · isolamento entre empresas · exclusão só por admin.

## Fase 02 — E2E (7 cenários) — ✅ (total acumulado 22/22, Fase 01 reexecutada)
Etiqueta com cor · cadastro e bloqueio de duplicado · lista + seleção em lote · etiqueta em lote + filtro · ficha com edição, consentimento, responsável e histórico · download CSV · vendedor vê só os seus.

## Fase 03 — Integração (11 cenários) — ✅ (total acumulado 50/50)
Detecção de colunas · prévia sem gravar (novo/existente/repetido/inválido) · importação para nova lista completando só campos vazios · vendedor só com permissão individual · limite de contatos recusa a importação inteira · bloqueio sem funcionalidade · montagem da consulta · sem chave do Google → mensagem clara · mapeamento da resposta da API (resposta controlada no teste), "já na base", salvar sem duplicar · erro 403 traduzido · limite mensal de pesquisas.

## Fase 03 — E2E (4 cenários) — ✅ (total acumulado 26/26, Fases 01–02 reexecutadas)
Importação XLSX com detecção, prévia e nova lista · CSV do Excel (ponto e vírgula, Windows-1252) · Google sem chave sem resultados inventados · vendedor bloqueado por URL (HTTP 307).

## Fase 04 — Integração (11 cenários) — ✅ (total acumulado 61/61)
Personalização de variáveis · rascunho numerado sem duplicar seleção · variável desconhecida recusada · edição troca a seleção · não inicia sem WhatsApp conectado · com conexão: inicia, ignora descadastrados/sem telefone, enfileira, pausa/retoma sem perda, cancela, arquiva · duplicação · programação exige data futura · salvar seleção como lista · modelos de script e IA sem chave · isolamento entre empresas.

## Fase 04 — E2E (7 cenários) — ✅ (total acumulado 33/33, Fases 01–03 reexecutadas)
Liberação de Campanhas pelo admin geral · nova campanha com lista, seleção, variáveis e pré-visualização · IA sem chave · contato manual dentro da campanha · iniciar bloqueado sem WhatsApp e rascunho salvo · listagem com indicadores, duplicar, arquivar · resultados e vínculo campanha ↔ contato.

## Fase 05 — Integração (20 cenários) — ✅ (total acumulado 81/81)
A Graph API da Meta é substituída SOMENTE no teste por um simulador local que registra as chamadas, para validar a sequência oficial (código → token → WABA → registro/sincronização) e todos os fluxos. Cenários: sem credenciais da plataforma · vendedor bloqueado · coexistência sem registro + sincronização agendada · número novo com PIN criptografado · código expirado · mesmo número em outra empresa / reconexão · vendedores do número · modelos aprovados · disparo com modelo e parâmetros, opt-out ignorado, erro 131026 como falha · janela de 24h · retentativa 3x sem duplicar · pausa por desconexão · HMAC · status sem retroceder · resposta → conversa/campanha (idempotente) · SAIR + confirmação · lead novo distribuído ao vendedor do número · eco do celular, histórico e contatos sem telefone · isolamento · PARTNER_REMOVED e desconexão manual.

## Fase 05 — E2E (4 cenários) — ✅ (total acumulado 37/37, Fases 01–04 reexecutadas)
Módulo com botão de conexão e orientações · conexão manual validada na Meta (falha clara, nada simulado) · webhook recusa token/assinatura inválidos · vendedor bloqueado.

## Fase 05b — QR Code / Evolution — Integração (13 cenários) — ✅ (total acumulado 94/94)
Servidor não configurado · vendedor bloqueado · sessão própria com webhook e segredo (guardado só como hash) · QR renovado e código de pareamento · outra empresa bloqueada · autenticação do webhook · conexão aberta registra número · identificação por telefone/LID e grupos ignorados · mensagem recebida idempotente e distribuída ao vendedor · eco do celular · campanha por QR com status e resposta, sem duplicar · SAIR com confirmação · desconexão pelo celular e exclusão.
**Teste real local:** imagem oficial `evoapicloud/evolution-api:v2.3.8` + `infra/evolution` executada com o PostgreSQL do projeto: migrações no schema `evolution_api` (37 tabelas, schema `public` intacto), autenticação, criação/consulta/remoção de sessão a partir do código da Marktvision ✅. Geração do QR não validada aqui (rede do WhatsApp bloqueada neste ambiente) — validar no Render.

## Fase 06 — Integração (12 cenários) — ✅ (total acumulado 106/106)
Recebidas com não lidas e visibilidade por vendedor · abrir marca como lida · resposta real pelo provedor e IA desligada · falha registrada e informada · envio de imagem · IA por conversa / assumir · transferência com contato · negociação sem duplicar · retorno, observações, encerrar e reabrir com nova mensagem · respostas rápidas · sugestão com IA (permissão/chave) · isolamento.

## Fase 06 — E2E (4 cenários) — ✅ (total acumulado 41/41, Fases 01–05 reexecutadas)
Webhook autenticado (segredo errado recusado) → conversa com contador no menu · etiqueta, negociação e transferência · envio sem servidor de WhatsApp: erro claro · visibilidade por vendedor.

## Fase 07 — Integração (10) ✅ (total 116/116) · E2E (3) ✅ (total 44/44)
Rodízio de leads · negociação com campanha de origem · visibilidade/movimentação por vendedor · ganho/perda exigem dados · venda atualiza contato, campanha, dashboard e indicadores · reabrir desfaz venda · transferência · funil personalizável · metas com realizado · busca/isolamento. E2E: arrastar + seletor de etapa + registrar venda · lista e indicadores · distribuição pela tela de contatos.
Erros corrigidos: arraste do Kanban não funciona em celular (incluído seletor "Mover para etapa"); mensagens com falha contavam como atendimento; busca por texto sem números casava com qualquer telefone.

## Fase 08 — Integração (9) ✅ · E2E (4) ✅
Provedor de IA ausente → erro claro sem texto inventado · contexto/documentos isolados por empresa · horário de atendimento · decisão de transferir · resposta automática pela fila. E2E: liberar Chatbot IA, cadastrar contexto, aviso sem provedor com teste desabilitado, vendedor bloqueado.

## Fase 09 — Integração (6) ✅ (total 132/132) · E2E (3) ✅ (total 51/51)
Dashboard com filtros reais · vendedor restrito aos próprios números · relatórios de vendas/campanhas/perdas/prospecção/metas/mensagens · atendimento só para administrador · isolamento entre empresas · CSV sem injeção de fórmula e XLSX com números. E2E: filtro por vendedor, relatório de vendas com download CSV/Excel e versão PDF, vendedor sem dados de outros.
Erros corrigidos: consultas com filtros não usados falhavam no PostgreSQL (parâmetros sem tipo) → declaração tipada dos filtros; gráficos recebiam funções do servidor (página quebrava) → formato por nome; percentuais com ponto → vírgula; funil mostrava "0%" ao dividir por etapa vazia → percentual sobre os leads.

## Fase 10 — Integração 132/132 · E2E 52/52 · desempenho · atualização
- E2E de segurança: cabeçalhos (CSP, X-Frame-Options), exportações e impressão bloqueadas sem sessão.
- Desempenho (`npm run test:perf`, banco de teste): 20.000 contatos / 60.000 mensagens / 5.000 negociações — dashboard ≈ 0,65 s; relatórios 3–470 ms.
- Atualização de instalação existente (Docker): banco na migração 0008 com empresa e 5 usuários → backup → nova imagem → 0009 e 0010 aplicadas automaticamente, dados preservados; gestora + 3 vendedores simultâneos abrindo dashboard, relatórios, contatos, conversas e CRM; sem bloqueios de CSP.
- Observação do ambiente de testes: o Docker Hub limitou downloads (429); a imagem base foi obtida do espelho público `mirror.gcr.io` só nesta simulação.

## Identidade visual — Integração (8) ✅ (total 140/140) · E2E (11) ✅ (total 62/62)
Integração: endereço gerado sem acentos e único · duas empresas personalizadas com cores e logomarcas diferentes e independentes · admin da empresa bloqueado sem liberação, liberado só para a própria empresa, sem alterar endereço · vendedor bloqueado · RLS impede ler/alterar a personalização e os arquivos de outra empresa · validação de hexadecimal, contraste, fundo claro, tipo (SVG recusado) e tamanho da logomarca · substituir/remover logomarca sem afetar a outra empresa · restaurar padrão · endereço duplicado recusado.
E2E: cadastro da 2ª empresa · editor com logomarca, hex e pré-visualização (variável CSS conferida) para as duas empresas · cores ilegíveis bloqueadas · vendedora da empresa 1 vê cores/logomarca/nome em dashboard, contatos, conversas e CRM (cor do menu e do fundo conferidas) · vendedor da empresa 2 vê só a dele · login próprio da empresa, identidade imediata após o login e retorno a ele ao sair · endereço inexistente = 404 · painel do admin geral inalterado mesmo após navegar a partir do ambiente da empresa · liberação da permissão e personalização pelo admin da empresa sem afetar a outra · restaurar padrão.
Teste antigo ajustado: o plano "Completo" libera todas as funcionalidades exceto "Identidade visual" (regra do requisito: o administrador geral libera).

## Publicação (servidor simulado com `servidor.sh instalar`, modo HTTPS, domínio localhost)
- Instalação sem interação: senhas geradas, `.env` com permissão 600, serviços saudáveis, administrador criado ✅
- HTTPS (HTTP/2) com HSTS/CSP; HTTP redireciona (308) para HTTPS ✅
- Somente 80/443 publicados; aplicação em 127.0.0.1:3000 (fechada no IP externo); banco e Evolution sem portas ✅
- Cookie de sessão `Secure` + `HttpOnly`; 3 vendedores simultâneos pela tela de login da empresa ✅
- `X-Forwarded-For` falsificado ignorado: tentativa de login registrada com o IP real ✅
- Queda forçada do processo (kill -9) → reinício automático e saúde restabelecida ✅
- `backup`, `restaurar` (dados conferidos), `status`, `definir` (chave inválida recusada) ✅
- Não executado aqui: instalação do Docker por apt e firewall ufw (Docker já presente; `SEM_FIREWALL=1`), certificado real do Let's Encrypt e túnel real (exigem domínio), `atualizar` via git no servidor.

## Instalação local (Docker) — executada neste ambiente
Conjunto completo (aplicação + PostgreSQL + Evolution v2.3.8 + backup) com Docker Compose: saúde dos serviços, usuário de banco sem superpoderes, migrações, criação de administrador (senha fraca recusada), backup automático, 3 vendedores simultâneos isolados, sessão do WhatsApp criada automaticamente, persistência após desligar/religar ✅. Não executado aqui: scripts .bat/PowerShell (não há Windows) e leitura real do QR (rede do WhatsApp bloqueada).

## Pendente de validação real (credenciais externas)
Embedded Signup e envio/recebimento reais dependem do app da Marktvision aprovado como Tech Provider na Meta e do domínio público (Render).

## Erros encontrados e corrigidos
1. Tentativas de login falhas eram gravadas dentro da transação revertida → bloqueio de força bruta nunca ativava. Corrigido: a transação sempre confirma e o erro é lançado depois.
2. Redirecionamentos de permissão ocorriam após início do streaming (redirecionamento no cliente). Corrigido com guarda central no layout → HTTP 307 real.
3. Com RLS, `INSERT ... RETURNING` em `users` falhava para admin da empresa (linha ainda sem vínculo). Corrigido gerando o UUID na aplicação.
10. Falha de envio na conversa era desfeita junto com a transação (sumia do histórico). Corrigido: registra e depois informa.
9. Mensagens recebidas no mesmo segundo podiam aparecer fora de ordem. Corrigido: horário de chegada com milissegundos (histórico mantém o horário original).
8. Teste de campanha dependia da ordem de envio (contatos gravados no mesmo instante). Corrigido o teste; rodado 3x seguidas sem falha.
7. Indicadores da listagem de campanhas sobrepostos em telas de 1440 px. Corrigido com linha de indicadores em texto ("3 contatos | 0 enviados | …").
6. Limite de contatos contava também contatos já existentes numa importação (bloqueio indevido). Corrigido: só contatos novos contam.
5. Erros do PostgreSQL (ex.: nome de lista duplicado) chegavam crus aos serviços. Corrigido: `withScope` converte todo erro de banco em mensagem em português.
4. Troca de ambiente do admin geral mantinha menu antigo → navegação completa após a troca.

## Pendentes de validação real (dependem de credenciais)
Google Places API, Meta WhatsApp Cloud API, provedores de IA (Gemini/Groq/Ollama/Anthropic) — Fases 03, 05 e 08. Leitura real do QR Code (Evolution) e scripts .bat no Windows.
