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

## Erros encontrados e corrigidos
1. Tentativas de login falhas eram gravadas dentro da transação revertida → bloqueio de força bruta nunca ativava. Corrigido: a transação sempre confirma e o erro é lançado depois.
2. Redirecionamentos de permissão ocorriam após início do streaming (redirecionamento no cliente). Corrigido com guarda central no layout → HTTP 307 real.
3. Com RLS, `INSERT ... RETURNING` em `users` falhava para admin da empresa (linha ainda sem vínculo). Corrigido gerando o UUID na aplicação.
4. Troca de ambiente do admin geral mantinha menu antigo → navegação completa após a troca.

## Pendentes de validação real (dependem de credenciais)
Google Places API, Meta WhatsApp Cloud API, API de IA — Fases 03, 05 e 08.
