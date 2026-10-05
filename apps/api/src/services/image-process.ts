import { fork } from 'node:child_process';
import { ImageConversionError, type ImageArtifact, type ImageConvertOptions } from './image-types.js';

const sourceMode = import.meta.url.endsWith('.ts');
const imageWorker = new URL(sourceMode ? './image-worker.ts' : './image-worker.js', import.meta.url);
type WorkerResult = { ok: true; artifact: ImageArtifact } | { ok: false; code: ImageConversionError['code']; message: string };

/** A hard deadline covers startup, metadata, native decoding and encoding.
 * Completion waits for process exit, so the caller must hold its slot until
 * this promise settles. workerUrl is an internal test seam, never HTTP input.
 */
export async function convertImageInProcess(input: Buffer, options: ImageConvertOptions, signal?: AbortSignal, workerUrl = imageWorker): Promise<ImageArtifact> {
  if (signal?.aborted) throw new ImageConversionError('conversion_failed', 'Image conversion was cancelled.');
  const timeoutMs = options.timeoutMs ?? 8_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) throw new ImageConversionError('invalid_options', 'Image timeout is outside the allowed range.');
  if (input.byteLength > (options.maxInputBytes ?? 10 * 1024 * 1024)) throw new ImageConversionError('input_too_large', 'Image input exceeds the byte limit.');
  return new Promise((resolve, reject) => {
    // Do not copy provider secrets or arbitrary NODE_OPTIONS into the child.
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', UV_THREADPOOL_SIZE: '2' };
    for (const name of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[name]) env[name] = process.env[name];
    const child = fork(workerUrl, [], {
      execArgv: [...(sourceMode && workerUrl.pathname.endsWith('.ts') ? ['--import', 'tsx'] : []), '--max-old-space-size=128', '--disable-proto=throw'],
      serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env,
    });
    let result: WorkerResult | undefined;
    let failure: ImageConversionError | undefined;
    const stop = () => { child.kill('SIGKILL'); };
    const abort = () => { failure ??= new ImageConversionError('conversion_failed', 'Image conversion was cancelled.'); stop(); };
    const timer = setTimeout(() => { failure ??= new ImageConversionError('conversion_failed', 'Image conversion exceeded the time limit.'); stop(); }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.once('message', (message: WorkerResult) => { result = message; stop(); });
    child.once('error', () => { failure ??= new ImageConversionError('conversion_failed', 'Image process could not start.'); stop(); });
    child.once('close', () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (failure) return reject(failure);
      if (!result) return reject(new ImageConversionError('conversion_failed', 'Image process stopped without a result.'));
      if (!result.ok) return reject(new ImageConversionError(result.code, result.message));
      resolve({ ...result.artifact, data: Buffer.from(result.artifact.data) });
    });
    child.send({ input, options }, (error) => { if (error) { failure ??= new ImageConversionError('conversion_failed', 'Image process could not receive input.'); stop(); } });
    if (signal?.aborted) abort();
  });
}
