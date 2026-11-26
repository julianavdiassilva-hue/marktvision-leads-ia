#!/bin/bash
# Inicialização da Evolution API no Render.
# - Usa o MESMO PostgreSQL da Marktvision, em um schema separado (evolution_api): sem custo extra de banco.
# - SERVER_URL = URL pública do serviço (o Render informa em RENDER_EXTERNAL_URL).
set -e
if [ -z "$DATABASE_CONNECTION_URI" ] && [ -n "$DATABASE_URL" ]; then
  if [[ "$DATABASE_URL" == *\?* ]]; then SEP="&"; else SEP="?"; fi
  export DATABASE_CONNECTION_URI="${DATABASE_URL}${SEP}schema=evolution_api"
fi
export SERVER_URL="${RENDER_EXTERNAL_URL:-${SERVER_URL:-http://localhost:8080}}"
export SERVER_PORT="${PORT:-8080}"
# sessões: credenciais no PostgreSQL e chaves de criptografia no disco persistente (/evolution/instances)
mkdir -p /evolution/instances
. ./Docker/scripts/deploy_database.sh
exec npm run start:prod
