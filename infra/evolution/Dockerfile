# Servidor de conexão por QR Code (Evolution API v2 — Baileys). Um servidor para TODAS as empresas;
# cada número conectado é uma instância (sessão) independente.
FROM evoapicloud/evolution-api:v2.3.8
COPY start.sh /evolution/start-render.sh
ENV DATABASE_PROVIDER=postgresql \
    DATABASE_SAVE_DATA_INSTANCE=true \
    DATABASE_SAVE_DATA_NEW_MESSAGE=true \
    DATABASE_SAVE_MESSAGE_UPDATE=true \
    DATABASE_SAVE_DATA_CONTACTS=false \
    DATABASE_SAVE_DATA_CHATS=false \
    DATABASE_SAVE_DATA_LABELS=false \
    DATABASE_SAVE_DATA_HISTORIC=false \
    DATABASE_DELETE_MESSAGE=true \
    CACHE_REDIS_ENABLED=false \
    CACHE_LOCAL_ENABLED=true \
    DEL_INSTANCE=false \
    WEBHOOK_GLOBAL_ENABLED=false \
    WEBSOCKET_ENABLED=false \
    RABBITMQ_ENABLED=false \
    SQS_ENABLED=false \
    S3_ENABLED=false \
    TELEMETRY_ENABLED=false \
    CONFIG_SESSION_PHONE_CLIENT="Marktvision Leads IA" \
    CONFIG_SESSION_PHONE_NAME=Chrome \
    QRCODE_LIMIT=30 \
    QRCODE_COLOR="#008C48" \
    AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false \
    LANGUAGE=pt-BR \
    LOG_LEVEL=ERROR,WARN,INFO
ENTRYPOINT ["/bin/bash", "/evolution/start-render.sh"]
