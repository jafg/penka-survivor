import { MATCHDAY_RESOLUTION_QUEUE } from './queues';

console.log(
  `[workers] placeholder — RabbitMQ consumer for "${MATCHDAY_RESOLUTION_QUEUE}" not wired yet`,
);

// Keep the process alive so `turbo run dev` treats it like the other long-running apps.
await new Promise<never>(() => {});
