/** Inicia a fila de processamento junto com o servidor (desative com WORKER_ENABLED=false). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.WORKER_ENABLED !== "false" && process.env.DATABASE_URL) {
    const { startWorker } = await import("./server/jobs/worker");
    startWorker();
  }
}
