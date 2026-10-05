import { buildApp } from './app.js';

const app = await buildApp();
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';

await app.listen({ port, host });

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  void app.close().then(() => { clearTimeout(deadline); process.exitCode = 0; }, () => {
    app.log.error({ code: 'shutdown_failed' }, 'API shutdown failed.');
    process.exitCode = 1;
  });
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
