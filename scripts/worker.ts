/** Fila de processamento em processo separado (opcional): npm run worker */
import "dotenv/config";
import { startWorker } from "../src/server/jobs/worker";
startWorker(3000);
