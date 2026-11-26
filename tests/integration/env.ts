import "dotenv/config";
// Os testes SEMPRE usam o banco de testes, nunca o de desenvolvimento.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DATABASE_OWNER_URL = process.env.TEST_DATABASE_OWNER_URL;
