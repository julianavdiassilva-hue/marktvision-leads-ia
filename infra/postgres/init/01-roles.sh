#!/bin/bash
# Executado UMA vez, na criação do banco. Cria o usuário da aplicação (sem superpoderes: sujeito ao isolamento RLS).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  create role mv_app login password '${APP_DB_PASSWORD}';
  create extension if not exists citext;
EOSQL
