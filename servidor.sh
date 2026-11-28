#!/usr/bin/env bash
# =====================================================================
# Marktvision Leads IA — administração do SERVIDOR na internet (VPS Linux Ubuntu 22.04/24.04)
# Uso: sudo ./servidor.sh <ação>
#   instalar    prepara o servidor (Docker, firewall, senhas), publica no domínio com HTTPS e cria o admin geral
#   iniciar | parar | reiniciar | status | logs
#   backup      backup imediato (banco + sessões do WhatsApp) em ./backups/manual
#   restaurar   volta os dados de um backup (faz backup do estado atual antes)
#   atualizar   baixa a versão mais nova do GitHub (backup antes; dados preservados)
#   admin       cria ou redefine a senha do administrador geral
#   dominio     troca o domínio ou o modo de publicação (HTTPS direto ou Cloudflare Tunnel)
#   definir CHAVE VALOR   altera uma configuração de integração (ex.: AI_API_KEY) e reinicia
# Sem interação (automação): defina DOMINIO, MODO_PUBLICACAO (https|cloudflare), CLOUDFLARE_TUNNEL_TOKEN,
#   ADMIN_USERNAME e ADMIN_PASSWORD no ambiente antes de "instalar".
# =====================================================================
set -Eeuo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ"
ENV_FILE="$RAIZ/.env"
LOG="$RAIZ/servidor.log"

verde() { printf '\033[32m  %s\033[0m\n' "$*"; echo "$(date -Is) INFO $*" >> "$LOG"; }
aviso() { printf '\033[33m  %s\033[0m\n' "$*"; echo "$(date -Is) AVISO $*" >> "$LOG"; }
erro()  { printf '\033[31m  ERRO: %s\033[0m\n' "$*" >&2; echo "$(date -Is) ERRO $*" >> "$LOG"; exit 1; }
titulo(){ printf '\n\033[36m== %s ==\033[0m\n' "$*"; }
trap 'erro "falha na linha $LINENO. Detalhes em servidor.log"' ERR

env_get() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }
env_set() {
  local k="$1" v="$2"
  touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
  if grep -qE "^$k=" "$ENV_FILE"; then
    local tmp; tmp="$(mktemp)"; awk -v k="$k" -v v="$v" -F= 'BEGIN{OFS="="} $1==k{print k"="v; next} {print}' "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
  else echo "$k=$v" >> "$ENV_FILE"; fi
}
segredo() { openssl rand -hex "$1"; }

perfis() {
  local p=""
  case "$(env_get MODO_PUBLICACAO)" in
    https) p="--profile https" ;;
    cloudflare) p="--profile dominio" ;;
  esac
  [ "$(env_get AI_LOCAL)" = "sim" ] && p="$p --profile ia-local"   # IA local (Ollama), se ativada
  echo "$p"
}
# shellcheck disable=SC2046
compose() { docker compose $(perfis) "$@"; }

exige_root() { [ "$(id -u)" -eq 0 ] || erro "Execute com sudo: sudo ./servidor.sh $ACAO"; }

garantir_docker() {
  if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    titulo "Instalando Docker (pacotes oficiais do Ubuntu)"
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose-v2 git openssl curl ca-certificates >/dev/null \
      || erro "Não foi possível instalar o Docker. Use Ubuntu 22.04 ou 24.04."
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true   # volta sozinho após reiniciar o servidor
  docker info >/dev/null 2>&1 || erro "O Docker não está respondendo."
}

garantir_swap() {
  local mem; mem=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
  if [ "$mem" -lt 3500 ] && [ "$(swapon --show --noheadings | wc -l)" -eq 0 ] && [ ! -f /swapfile ]; then
    titulo "Memória de reserva (swap 2 GB) — servidor com ${mem} MB de RAM"
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
}

firewall() {
  [ "${SEM_FIREWALL:-0}" = "1" ] && { aviso "Firewall não alterado (SEM_FIREWALL=1)."; return; }
  command -v ufw >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw >/dev/null || true
  command -v ufw >/dev/null || { aviso "ufw indisponível: libere somente as portas 22, 80 e 443 no painel do provedor."; return; }
  titulo "Firewall: somente SSH (22), HTTP (80) e HTTPS (443)"
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
  verde "Banco de dados, servidor do WhatsApp e a porta 3000 ficam inacessíveis pela internet."
}

perguntar_publicacao() {
  local dom="${DOMINIO:-}" modo="${MODO_PUBLICACAO:-}" tok="${CLOUDFLARE_TUNNEL_TOKEN:-}"
  if [ -z "$dom" ]; then read -rp "  Endereço do sistema (ex.: app.suaempresa.com.br): " dom; fi
  dom="$(echo "$dom" | tr 'A-Z' 'a-z' | sed -E 's#^https?://##; s#/.*$##')"
  [[ "$dom" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ || "$dom" == "localhost" ]] || erro "Domínio inválido: $dom"
  if [ -z "$modo" ]; then
    echo "  Como publicar:"
    echo "   [1] HTTPS direto neste servidor (recomendado em VPS; registro DNS tipo A para o IP do servidor)"
    echo "   [2] Cloudflare Tunnel (DNS na Cloudflare; não abre as portas 80/443)"
    read -rp "  Escolha [1]: " o; [ "${o:-1}" = "2" ] && modo=cloudflare || modo=https
  fi
  if [ "$modo" = "cloudflare" ] && [ -z "$tok" ]; then read -rsp "  Cole o token do túnel (Cloudflare Zero Trust > Networks > Tunnels): " tok; echo; fi
  [ "$modo" = "cloudflare" ] && [ -z "$tok" ] && erro "Token do túnel não informado."
  env_set DOMINIO "$dom"; env_set APP_URL "https://$dom"; env_set MODO_PUBLICACAO "$modo"
  env_set CLOUDFLARE_TUNNEL_TOKEN "${tok:-}"
}

criar_env() {
  if [ -f "$ENV_FILE" ] && [ -n "$(env_get DB_OWNER_PASSWORD)" ]; then verde "Configuração existente mantida (.env)."; return; fi
  titulo "Gerando senhas e chaves exclusivas deste servidor"
  umask 077
  cat > "$ENV_FILE" <<EOF
# Marktvision Leads IA — configuração do SERVIDOR. NÃO compartilhe nem versione este arquivo.
DB_OWNER_PASSWORD=$(segredo 24)
DB_APP_PASSWORD=$(segredo 24)
EVOLUTION_API_KEY=$(segredo 24)
ENCRYPTION_KEY=$(openssl rand -base64 32)
APP_BIND=127.0.0.1
APP_PORT=3000
COOKIE_SECURE=true
BACKUP_KEEP_DAYS=14
SEARCH_PROVIDER=osm
GOOGLE_PLACES_API_KEY=
ANTHROPIC_API_KEY=
AI_PROVIDER=
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
META_APP_ID=
META_APP_SECRET=
META_EMBEDDED_SIGNUP_CONFIG_ID=
META_WEBHOOK_VERIFY_TOKEN=$(segredo 16)
EOF
  chmod 600 "$ENV_FILE"
}

conferir_dns() {
  [ "$(env_get MODO_PUBLICACAO)" = "https" ] || return 0
  local dom ip_dns ip_srv; dom="$(env_get DOMINIO)"
  [ "$dom" = "localhost" ] && return 0
  ip_dns="$(getent ahostsv4 "$dom" | awk 'NR==1{print $1}')"
  ip_srv="$(hostname -I | tr ' ' '\n' | grep -vE '^(10\.|127\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)' | grep -E '^[0-9.]+$' | head -1)"
  if [ -z "$ip_dns" ]; then aviso "O domínio $dom ainda não aponta para nenhum IP. Crie o registro DNS tipo A para ${ip_srv:-o IP do servidor}. O HTTPS é emitido assim que o DNS propagar."
  elif [ -n "$ip_srv" ] && [ "$ip_dns" != "$ip_srv" ]; then aviso "O domínio $dom aponta para $ip_dns, mas este servidor é $ip_srv. Corrija o registro A."
  else verde "DNS correto: $dom -> $ip_dns"; fi
}

aguardar_app() {
  verde "Aguardando o sistema ficar pronto (a primeira vez leva alguns minutos)..."
  for _ in $(seq 1 120); do
    local porta; porta="$(env_get APP_PORT)"
    if curl -fsS "http://127.0.0.1:${porta:-3000}/api/health" >/dev/null 2>&1; then verde "Sistema pronto."; return; fi
    sleep 5
  done
  erro "O sistema não respondeu a tempo. Veja: sudo ./servidor.sh logs"
}

criar_admin() {
  titulo "Administrador geral"
  local u="${ADMIN_USERNAME:-}" p="${ADMIN_PASSWORD:-}" p2
  [ -n "$u" ] || { read -rp "  Login do administrador geral [admin]: " u; u="${u:-admin}"; }
  if [ -z "$p" ]; then
    while true; do
      read -rsp "  Senha (mínimo 10 caracteres): " p; echo; read -rsp "  Repita a senha: " p2; echo
      [ "$p" = "$p2" ] && [ "${#p}" -ge 10 ] && break; aviso "Senhas diferentes ou curtas. Tente de novo."
    done
  fi
  # a senha vai por variável de ambiente (não aparece na lista de processos nem em arquivos)
  ADMIN_USERNAME="$u" ADMIN_PASSWORD="$p" compose exec -T -e ADMIN_USERNAME -e ADMIN_PASSWORD app npm run --silent admin \
    || erro "Não foi possível criar o administrador (veja a mensagem acima)."
  verde "Guarde o login '$u' e a senha em local seguro."
}

backup_agora() {
  local ts; ts="$(date +%Y-%m-%d_%H%M)"; mkdir -p "$RAIZ/backups/manual"
  verde "Gerando backup ($1)..."
  compose exec -T backup sh -c "pg_dump -h postgres -U mv_owner -d marktvision -Fc -f /backups/manual/banco_$ts.dump && tar -czf /backups/manual/sessoes_whatsapp_$ts.tar.gz -C /sessions ." \
    || erro "Falha ao gerar o backup."
  verde "Backup: backups/manual/banco_$ts.dump e sessoes_whatsapp_$ts.tar.gz"
}

mostrar_endereco() {
  titulo "Endereço"
  verde "Sistema: https://$(env_get DOMINIO)"
  verde "Tela de login de cada empresa: https://$(env_get DOMINIO)/entrar/<empresa>  (veja em Empresas > Identidade Visual)"
  [ -n "$(env_get META_APP_ID)" ] && verde "Webhook da Meta: https://$(env_get DOMINIO)/api/webhooks/whatsapp"
  return 0
}

instalar() {
  exige_root
  titulo "Marktvision Leads IA — instalação no servidor"
  garantir_docker; garantir_swap; criar_env
  [ -n "$(env_get DOMINIO)" ] && [ -z "${DOMINIO:-}" ] && verde "Domínio configurado: $(env_get DOMINIO)" || perguntar_publicacao
  firewall
  conferir_dns
  titulo "Montando e iniciando os serviços (pode levar de 5 a 15 minutos)"
  if [ "${MV_PULAR_BUILD:-0}" = "1" ]; then aviso "Usando imagens já montadas (MV_PULAR_BUILD=1)."; else compose build; fi
  compose up -d
  aguardar_app
  if [ "${SEM_ADMIN:-0}" != "1" ]; then criar_admin; fi
  mostrar_endereco
  verde "Os serviços reiniciam sozinhos se o servidor for reiniciado ou se algum processo parar."
}

atualizar() {
  exige_root
  [ -d "$RAIZ/.git" ] || erro "Esta pasta não foi obtida com git clone."
  backup_agora "antes da atualização"
  titulo "Baixando a versão mais recente"
  git fetch -q origin main || erro "Sem acesso ao GitHub."
  [ -z "$(git status --porcelain --untracked-files=no)" ] || erro "Há arquivos do programa alterados nesta pasta. Nada foi atualizado."
  git merge -q --ff-only origin/main || erro "Não foi possível aplicar a atualização. Nada foi alterado."
  titulo "Aplicando (dados preservados; migrações do banco são automáticas)"
  compose build; compose up -d; aguardar_app
  verde "Atualizado para: $(git log -1 --format='%h %s')"
}

restaurar() {
  exige_root
  mapfile -t arqs < <(find "$RAIZ/backups" -name 'banco_*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -15 | cut -d' ' -f2-)
  [ "${#arqs[@]}" -gt 0 ] || erro "Nenhum backup encontrado em backups/."
  titulo "Backups disponíveis"
  for i in "${!arqs[@]}"; do echo "  [$((i+1))] ${arqs[$i]#"$RAIZ/backups/"}"; done
  read -rp "  Número do backup (Enter cancela): " n; [ -n "$n" ] || return 0
  local arq="${arqs[$((n-1))]}" rel; rel="${arq#"$RAIZ/backups/"}"
  aviso "Os dados ATUAIS serão substituídos pelos do backup $rel."
  read -rp "  Digite RESTAURAR para confirmar: " c; [ "$c" = "RESTAURAR" ] || { verde "Cancelado."; return 0; }
  backup_agora "antes da restauração"
  compose stop app evolution
  compose exec -T backup sh -c "pg_restore -h postgres -U mv_owner -d marktvision --clean --if-exists --no-owner /backups/$rel"
  local tar="${arq/banco_/sessoes_whatsapp_}"; tar="${tar%.dump}.tar.gz"
  if [ -f "$tar" ]; then
    compose run --rm --no-deps -v "$RAIZ/backups:/b:ro" --entrypoint sh evolution -c "rm -rf /evolution/instances/* && tar -xzf /b/${tar#"$RAIZ/backups/"} -C /evolution/instances"
  fi
  compose up -d; aguardar_app; verde "Restauração concluída."
}

definir() {
  exige_root
  local k="${1:-}" v="${2:-}"
  case "$k" in
    GOOGLE_PLACES_API_KEY|SEARCH_PROVIDER|ANTHROPIC_API_KEY|AI_PROVIDER|AI_BASE_URL|AI_API_KEY|AI_MODEL|META_APP_ID|META_APP_SECRET|META_EMBEDDED_SIGNUP_CONFIG_ID|META_WEBHOOK_VERIFY_TOKEN|BACKUP_KEEP_DAYS) ;;
    *) erro "Uso: sudo ./servidor.sh definir CHAVE VALOR (chaves de integração permitidas: veja .env.example)" ;;
  esac
  [ -n "$v" ] || { read -rsp "  Valor de $k: " v; echo; }
  env_set "$k" "$v"; compose up -d; aguardar_app; verde "$k atualizado."
}

status() {
  titulo "Serviços"; compose ps --format 'table {{.Service}}\t{{.Status}}'
  titulo "Backup"
  [ -f "$RAIZ/backups/ultimo_backup.txt" ] && verde "Último backup automático: $(cat "$RAIZ/backups/ultimo_backup.txt")" || aviso "Nenhum backup automático ainda."
  [ -f "$RAIZ/backups/ultimo_erro_backup.txt" ] && aviso "Última falha de backup: $(cat "$RAIZ/backups/ultimo_erro_backup.txt")"
  titulo "Disco"; df -h "$RAIZ" | tail -1
  conferir_dns; mostrar_endereco
}

ACAO="${1:-}"; shift || true
case "$ACAO" in
  instalar) instalar ;;
  iniciar) exige_root; garantir_docker; compose up -d; aguardar_app; mostrar_endereco ;;
  parar) exige_root; compose stop; verde "Sistema parado. Os dados continuam salvos." ;;
  reiniciar) exige_root; compose restart; aguardar_app ;;
  status) status ;;
  logs) compose logs --tail 200 -f "${1:-app}" ;;
  backup) exige_root; backup_agora "manual" ;;
  restaurar) restaurar ;;
  atualizar) atualizar ;;
  admin) exige_root; criar_admin ;;
  dominio) exige_root; docker compose --profile https --profile dominio stop https tunel-fixo >/dev/null 2>&1 || true
    DOMINIO="" perguntar_publicacao; firewall; compose up -d; aguardar_app; conferir_dns; mostrar_endereco ;;
  definir) definir "$@" ;;
  *) sed -n '2,17p' "$0"; exit 1 ;;
esac
