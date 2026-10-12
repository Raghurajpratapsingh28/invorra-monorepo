import { env } from '../config/env';
import { logger } from '../lib/logger';
import type { DomainEvent } from './types';

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

class LogEventPublisher implements EventPublisher {
  async publish(event: DomainEvent): Promise<void> {
    logger.info({ event: event.name, organizationId: event.organizationId, entityId: event.entityId }, 'domain event');
  }
}

class NatsEventPublisher implements EventPublisher {
  constructor(private readonly fallback: EventPublisher) {}

  async publish(event: DomainEvent): Promise<void> {
    try {
      const { connect, StringCodec } = await import('nats');
      const connection = await connect({ servers: env.NATS_URL, timeout: 1500 });
      try {
        const manager = await connection.jetstreamManager();
        try {
          await manager.streams.info('INVORRA');
        } catch {
          await manager.streams.add({ name: 'INVORRA', subjects: ['invorra.>'] });
        }
        const jetstream = connection.jetstream();
        const codec = StringCodec();
        await jetstream.publish(`invorra.${event.name}`, codec.encode(JSON.stringify(event)));
      } finally {
        await connection.close();
      }
    } catch (error) {
      logger.warn({ err: error, event: event.name }, 'NATS publish failed; using log publisher');
      await this.fallback.publish(event);
    }
  }
}

const logPublisher = new LogEventPublisher();
const publisher: EventPublisher = env.NATS_URL
  ? new NatsEventPublisher(logPublisher)
  : logPublisher;

export async function publishEvent(
  event: Omit<DomainEvent, 'occurredAt'> & { occurredAt?: string },
): Promise<void> {
  if (env.NODE_ENV === 'test') {
    return;
  }
  await publisher.publish({
    ...event,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
  });
}
