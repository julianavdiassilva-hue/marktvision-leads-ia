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

## Fase 03 — ✅ concluída (26/11/2026)
| Item | Status | Evidência |
|---|---|---|
| Importação XLS/XLSX/CSV (leitura no navegador, servidor revalida tudo) | ✅ | E2E (XLSX e CSV Windows-1252) |
| Detecção automática de colunas + associação manual | ✅ | integração + E2E |
| Prévia: novos / já na base / repetidos / inválidos (com motivo) | ✅ | integração + E2E |
| Destino: nova lista, lista existente ou só base; responsável opcional | ✅ | integração + E2E |
| Importação atômica (falha ou limite = nada gravado), sem duplicar | ✅ | integração |
| Pesquisa Google Places (New): segmento, cidade, UF, bairro/região, paginação | ✅ código / ⏳ validação real (falta chave) | integração com resposta controlada |
| Marca "Já na base", filtro "somente com telefone", salvar em lista | ✅ | integração |
| Limite mensal de pesquisas + contador de uso | ✅ | integração |
| Sem chave: mensagem clara, nenhum resultado inventado | ✅ | integração + E2E |
| Aviso: telefone público ≠ consentimento | ✅ | E2E |

## Fase 04 — ✅ concluída (26/11/2026)
| Item | Status | Evidência |
|---|---|---|
| Central de campanhas em listagem horizontal compacta (nº, nome, lista, contatos, enviados, entregues, respostas, falhas, ignorados, convertidos, vendas, progresso, status) | ✅ | E2E |
| Ações: iniciar, pausar, retomar, editar, duplicar, cancelar, resultados, arquivar/restaurar | ✅ | integração + E2E |
| Botão destacado NOVA CAMPANHA; filtros por situação e busca; abas Ativas/Arquivadas | ✅ | E2E |
| Assistente em 7 etapas na mesma tela (nome, origem, seleção, script, WhatsApp, atendimento, execução) | ✅ | E2E |
| Origem: Google e planilha DENTRO da campanha, lista existente e cadastro manual | ✅ | E2E (lista, manual); Google/planilha reutilizam componentes testados na Fase 03 |
| Seleção: todos/individual, filtro, excluir da campanha, editar contato, duplicidade impossível, salvar como lista | ✅ | integração + E2E |
| Script: variáveis ({{primeiro_nome}} etc.), pré-visualização por contato, modelos salvos, gerar/melhorar com IA | ✅ / ⏳ IA aguarda chave | integração + E2E |
| Numeração sequencial por empresa (com trava contra concorrência) | ✅ | integração |
| Início exige WhatsApp CONECTADO — nenhum envio simulado | ✅ | integração + E2E |
| Ao iniciar/retomar: descadastrados e sem telefone viram "Ignorado" com motivo | ✅ | integração |
| Pausa devolve itens da fila a "pendente": nada se perde, nada é reenviado | ✅ | integração |
| Programação com data futura (job agendado) | ✅ (execução do job na Fase 05) | integração |
| Página de resultados com funil, progresso e situação por contato | ✅ | E2E |

## Fase 05 — ✅ concluída (26/11/2026) — envio real aguarda credenciais da Meta
| Item | Status | Evidência |
|---|---|---|
| Conexão pelo próprio cliente: botão “Conectar WhatsApp” (Embedded Signup oficial, documentação conferida) | ✅ código / ⏳ requer Tech Provider | integração (Graph simulado no teste) + E2E |
| Coexistência com o app WhatsApp Business (sem registro do número; sincronização de contatos e histórico em até 24h) | ✅ código / ⏳ validação real | integração |
| Número novo somente API (registro com PIN criptografado) | ✅ código / ⏳ validação real | integração |
| Token próprio por empresa, criptografado (AES-256-GCM); nenhum token compartilhado | ✅ | integração |
| Vários números por empresa (limite do plano), reconectar, desconectar, excluir, testar, status | ✅ | integração + E2E |
| Mesmo número não pode ser ligado a duas empresas | ✅ | integração |
| Vendedores responsáveis por número + distribuição automática de conversas | ✅ | integração |
| Modelos aprovados: sincronização e uso na campanha com mapeamento de parâmetros | ✅ | integração |
| Fila: envio no ritmo por número, retentativa (3x) para erros temporários, nunca reenvia item interrompido, pausa automática se desconectado ou no limite mensal | ✅ | integração |
| Janela de 24h respeitada (sem modelo, só quem tem conversa aberta) | ✅ | integração |
| Webhooks: assinatura HMAC, idempotência, status (sem retroceder), respostas, opt-out (SAIR) com confirmação, mensagens do celular, histórico, contatos (inclusive sem telefone), desconexão pelo app | ✅ | integração + E2E |
| Reprocessamento automático de webhooks com erro (até 5 tentativas) | ✅ | código |
| Conexão manual (avançado) validada na Meta | ✅ | E2E |

## Fase 05b — Conexão por QR Code (Evolution API) — ✅ concluída (26/11/2026)
| Item | Status | Evidência |
|---|---|---|
| Botão “Conectar WhatsApp” → QR Code renovado automaticamente → conexão detectada sozinha | ✅ / ⏳ leitura real do QR | integração + Evolution real local (QR depende da rede do WhatsApp, bloqueada aqui) |
| Código de pareamento pelo número (alternativa ao QR) | ✅ | integração |
| Sessão independente por empresa, criada pela plataforma; um servidor para todos | ✅ | integração |
| Webhook com segredo individual por sessão (hash), reenvio automático da Evolution | ✅ | integração |
| Mensagens recebidas/enviadas pelo celular, status de entrega/leitura, LID, grupos ignorados | ✅ | integração |
| Campanhas, SAIR, vendedores por número e conversas funcionando pela mesma lógica da integração oficial | ✅ | integração |
| Desconexão no celular, reconectar com novo QR, desconectar e excluir | ✅ | integração |
| Infraestrutura Render (serviço privado + disco + schema próprio) | ✅ arquivo pronto / ⏳ publicação | Evolution v2.3.8 executada localmente com o nosso PostgreSQL |
| Integração oficial da Meta mantida como alternativa | ✅ | E2E |

## Fase 07 — CRM e Equipe Comercial — ✅ concluída (27/11/2026)
| Item | Status | Evidência |
|---|---|---|
| Kanban com arrastar e soltar + seletor "Mover para etapa" (celular/teclado) e visualização em lista | ✅ | E2E |
| Valor por etapa, vendedor, campanha de origem, próximo retorno (atrasado em vermelho), observações | ✅ | integração + E2E |
| Venda exige valor; registra em `sales` e atualiza contato, vendedor, campanha e dashboard; reabrir desfaz a venda | ✅ | integração + E2E |
| Perda exige motivo (lista padrão + outro) | ✅ | integração |
| Funil personalizável (criar, renomear, reordenar, excluir vazias; venda/perda fixas) | ✅ | integração |
| Vendedor vê/move só as próprias negociações; transferência pelo administrador leva contato e conversa | ✅ | integração |
| Indicadores por vendedor no período: recebidos, atendidos, pendentes, negociações, vendas, valor, conversão, 1ª resposta, meta | ✅ | integração + E2E |
| Distribuição de leads em rodízio equilibrado (tela de contatos) | ✅ | integração + E2E |
| Metas individuais e coletivas com realizado real | ✅ | integração |

## Fase 06 — Central de Conversas — ✅ concluída (26/11/2026)
| Item | Status | Evidência |
|---|---|---|
| 3 colunas estilo WhatsApp Web: lista (busca, filtros, não lidas, etiquetas, responsável), histórico + envio, painel do contato/CRM | ✅ | E2E |
| Mensagens recebidas entram sozinhas (webhook) com não lidas e contador no menu; atualização automática a cada 5 s | ✅ | integração + E2E |
| Envio de texto e arquivos/imagens pelo provedor real; falha registrada e informada (sem simular) | ✅ | integração + E2E |
| Respostas rápidas (/atalho) e sugestão de resposta com IA (revisada pelo vendedor) | ✅ / ⏳ IA aguarda chave | integração |
| Vendedor vê só as conversas atribuídas; transferência leva junto contato e negociação | ✅ | integração + E2E |
| IA por conversa; ao assumir ou responder, a IA para | ✅ | integração |
| Etiquetas, criar negociação no CRM, próximo retorno, observações, histórico comercial, encerrar/reabrir | ✅ | integração + E2E |
| Origem do contato na campanha exibida | ✅ | integração |

## Fase 08 — Contexto da empresa e Chatbot IA — ✅ concluída (27/11/2026)
| Item | Status |
|---|---|
| Camada de IA com vários provedores: Anthropic (pago) e compatíveis com OpenAI — Google Gemini (franquia gratuita), Groq (franquia gratuita), Ollama (local, gratuito) | ✅ (`AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`) |
| Contexto da empresa: informações por categoria e documentos PDF/TXT/MD/CSV (texto extraído, isolado por empresa) | ✅ |
| Agente: tom, objetivo, perguntas de qualificação, regras, transferência para vendedor, horário de atendimento e mensagem fora do horário | ✅ |
| Resposta automática pela fila (`ai.reply`, agrupa mensagens seguidas em 5 s), só com base no contexto cadastrado; transfere quando não sabe | ✅ |
| Testar o agente na tela (nada é enviado pelo WhatsApp) | ✅ |
| Sem provedor configurado: aviso claro, teste desabilitado, conversas ficam com os vendedores | ✅ |
| Pesquisa de empresas gratuita pelo OpenStreetMap (padrão sem chave do Google) | ✅ |
| `CONFIGURAR_IA.bat` e `CONFIGURAR_PESQUISA.bat` (Ollama em perfil opcional do Docker) | ✅ preparado (não executado em Windows) |

## Fase 09 — Dashboard, metas e relatórios — ✅ concluída (27/11/2026)
| Item | Status |
|---|---|
| Dashboard com filtros (período, campanha, vendedor, origem), 8 indicadores, gráficos diários, funil, vendas por vendedor, resultados por campanha e metas | ✅ |
| Vendedor vê somente os próprios números (forçado no servidor, mesmo alterando o endereço) | ✅ |
| Relatórios: prospecção/captação, campanhas, mensagens/respostas, atendimento e desempenho (só administrador), vendas, conversão/perdas, metas | ✅ |
| Exportação CSV (Excel PT-BR, proteção contra fórmulas), Excel .xlsx (números somáveis) e PDF (versão para impressão → "Salvar como PDF") | ✅ (exige a funcionalidade "Exportação de dados") |

## Instalação local gratuita (Windows + Docker) — ✅ preparada (26/11/2026)
| Item | Status | Evidência |
|---|---|---|
| docker-compose: aplicação, PostgreSQL 16, Evolution API v2.3.8, backup automático, túnel Cloudflare (temporário ou domínio) | ✅ | conjunto executado com Docker neste ambiente |
| Somente a aplicação exposta (porta 3000); banco e Evolution em rede interna | ✅ | `docker compose ps` |
| Usuário do banco da aplicação sem superpoderes (RLS efetivo); senhas geradas por instalação | ✅ | consulta em `pg_roles` |
| Webhooks do WhatsApp pela rede interna (não saem do computador) | ✅ | sessão criada automaticamente na Evolution real |
| 3 vendedores simultâneos, cada um vê só o seu; gestora vê todos | ✅ | teste no navegador com 3 sessões paralelas |
| Persistência após desligar/religar | ✅ | down/up preservou empresa, usuários, contatos e sessão |
| Reinício automático após falha interna (`restart: unless-stopped`) | ⏳ não reproduzido aqui | mecanismo padrão do Docker |
| Backup automático diário (banco + sessões, 14 dias) e manual; restauração | ✅ backup automático executado / ⏳ restauração no Windows | arquivos gerados |
| Administrador sem senha padrão (criado/redefinido por CRIAR_ADMIN.bat, senha só como hash) | ✅ | testado no conjunto |
| Scripts Windows (.bat + PowerShell 5.1) e manual | ✅ escritos / ⏳ primeira execução no seu Windows | não há Windows neste ambiente |
| Painel "Saúde dos serviços" (banco, WhatsApp, fila, webhooks, backup) | ✅ | build + E2E |

## Infraestrutura
| Item | Status |
|---|---|
| RLS forçado também para o dono das tabelas (0004) — hospedagem com um único usuário de banco | ✅ |
| `render.yaml` (publicação com 1 clique) e `npm run start:prod` (migra + cria admin + inicia) | ✅ preparado, aguardando conta |

## Próximas fases
| Módulo | Status |
|---|---|
| Testes integrados finais, revisão de segurança, desempenho, preparação comercial | ⏭ Fase 10 |

## Decisões registradas
- IA e pesquisa: opções gratuitas por padrão para testes (Gemini/Groq/Ollama; OpenStreetMap). Serviços pagos só com autorização.
- WhatsApp: modalidade ativa = Evolution API (QR Code, não oficial, autorizada pela cliente); Meta oficial mantida como alternativa.
- (histórico) WhatsApp: somente integração oficial (Meta). Número pessoal não tem via oficial; orientação é migrar para WhatsApp Business e usar coexistência. Integrações não oficiais exigem autorização expressa.
- Fila de processamento roda dentro do servidor web (instrumentation.ts) e pode rodar separada (`npm run worker`); seguro com vários processos (SKIP LOCKED).
- IA: SDK oficial da Anthropic, modelo padrão `claude-opus-5-5` (variável AI_MODEL), esforço baixo para mensagens curtas, fallback automático no servidor habilitado (se o modelo recusar, outro responde).
- Planilhas lidas no navegador com SheetJS 0.18.5 (a CDN oficial com versões novas é inacessível neste ambiente e a versão do npm tem vulnerabilidades ao ler arquivos maliciosos). Assim o servidor nunca processa o arquivo bruto: recebe só valores mapeados (limite 20.000 linhas) e normaliza/valida novamente. Reavaliar ao publicar: trocar para a versão da CDN do SheetJS.
- Importação e pesquisa no Google não estão no padrão do vendedor; o administrador pode conceder individualmente.
- Supabase Auth não utilizado (exige e-mail); autenticação própria com login simples.
- Senha mínima: 8 caracteres, sem exigência de símbolos; bloqueio de senhas óbvias e senha = login.
- "Equipe Comercial" é necessária para o admin da empresa gerenciar usuários; sem ela, o admin geral gerencia.
- `users.must_change_password` existe no banco mas ainda não é usado na interface.
