import process from 'node:process';

process.once('message', ({ options }) => {
  if (options.outputFormat === 'png') {
    process.send({ ok: false, code: 'conversion_failed', message: String(process.pid) });
  }
  // Deliberately block the event loop: cooperative cancellation cannot stop it.
  while (true) { /* isolated test process */ }
});
