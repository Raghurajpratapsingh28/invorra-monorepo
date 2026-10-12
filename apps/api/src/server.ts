import { app } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { disconnectMongo } from './db/mongo';

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Invorra API listening');
});

server.on('error', (error) => {
  logger.error({ err: error }, 'Failed to start Invorra API');
  process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down Invorra API');
  server.close(async () => {
    await disconnectMongo();
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
});
