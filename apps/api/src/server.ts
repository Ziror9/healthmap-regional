import { disconnectPrisma } from '@healthmap/db';
import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();
const server = app.listen(env.API_PORT, env.API_HOST, () => {
  console.info(`[api] healthmap-api ouvindo em http://${env.API_HOST}:${env.API_PORT}`);
  console.info(`[api] ambiente: ${env.NODE_ENV}`);
});

async function shutdown(signal: string): Promise<void> {
  console.info(`[api] ${signal} recebido, encerrando...`);
  server.close(() => {
    void disconnectPrisma().finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
