import "dotenv/config";
import { resetDatabase } from "../../scripts/reset";
import { seedPlatformAdmin } from "../../scripts/seed";

export default async function setup() {
  const url = process.env.TEST_DATABASE_OWNER_URL;
  if (!url || !url.includes("test")) throw new Error("TEST_DATABASE_OWNER_URL deve apontar para um banco de testes.");
  await resetDatabase(url, false);
  await seedPlatformAdmin(url, { name: "Admin Teste", username: "admin", password: "admin-teste-2026" });
}
