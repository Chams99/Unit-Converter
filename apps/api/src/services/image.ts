import sharp, { type FormatEnum, type Metadata } from 'sharp';

export type ImageOutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff' | 'gif';
export type ImageConvertOptions = {
  readonly outputFormat: ImageOutputFormat;
  readonly width?: number;
  readonly height?: number;
  readonly quality?: number;
  readonly maxInputBytes?: number;
  readonly maxInputPixels?: number;
  readonly maxOutputBytes?: number;
  readonly timeoutMs?: number;
};
export type ImageArtifact = {
  readonly data: Buffer;
  readonly mimeType: string;
  readonly format: ImageOutputFormat;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly inputFormat: string;
  readonly inputBytes: number;
};

export class ImageConversionError extends Error {
  readonly code: 'input_too_large' | 'pixels_too_large' | 'unsupported_format' | 'invalid_options' | 'conversion_failed' | 'output_too_large' | 'concurrency_limit';
  constructor(code: ImageConversionError['code'], message: string) { super(message); this.name = 'ImageConversionError'; this.code = code; }
}

const mimeTypes: Record<ImageOutputFormat, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', tiff: 'image/tiff', gif: 'image/gif' };
const formats: readonly ImageOutputFormat[] = ['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'];

function positiveLimit(value: number, label: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new ImageConversionError('invalid_options', `${label} is outside the allowed range.`);
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ImageConversionError('conversion_failed', 'Image conversion exceeded the time limit.')), timeoutMs);
    work.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

/** Server-only bounded raster conversion. No URL or filename is accepted. */
export async function convertImage(input: Buffer | Uint8Array, options: ImageConvertOptions): Promise<ImageArtifact> {
  if (!(input instanceof Uint8Array) || input.byteLength === 0) throw new ImageConversionError('conversion_failed', 'Image input must be a non-empty byte buffer.');
  const maxInputBytes = options.maxInputBytes ?? 10 * 1024 * 1024;
  const maxInputPixels = options.maxInputPixels ?? 40_000_000;
  const maxOutputBytes = options.maxOutputBytes ?? 25 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 8_000;
  positiveLimit(maxInputBytes, 'maxInputBytes', 100 * 1024 * 1024);
  positiveLimit(maxInputPixels, 'maxInputPixels', 250_000_000);
  positiveLimit(maxOutputBytes, 'maxOutputBytes', 100 * 1024 * 1024);
  positiveLimit(timeoutMs, 'timeoutMs', 60_000);
  if (input.byteLength > maxInputBytes) throw new ImageConversionError('input_too_large', 'Image input exceeds the byte limit.');
  if (!formats.includes(options.outputFormat)) throw new ImageConversionError('invalid_options', 'Output format is not supported.');
  for (const [value, label] of [[options.width, 'width'], [options.height, 'height']] as const) if (value !== undefined) positiveLimit(value, label, 16_384);
  if (options.quality !== undefined && (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100)) throw new ImageConversionError('invalid_options', 'quality must be an integer from 1 to 100.');

  const source = Buffer.from(input);
  let metadata: Metadata;
  try {
    // Metadata reads the header without decoding all pixels. Read it without
    // Sharp's limit first so an oversized image can return the stable
    // `pixels_too_large` error below instead of a generic decode failure.
    metadata = await withTimeout(sharp(source, { failOn: 'warning' }).metadata(), timeoutMs);
  } catch (error) {
    if (error instanceof ImageConversionError) throw error;
    throw new ImageConversionError('conversion_failed', 'Input is not a supported or valid image.');
  }
  const inputFormat = metadata.format ?? '';
  if (!formats.includes(inputFormat as ImageOutputFormat)) throw new ImageConversionError('unsupported_format', 'Input image format is not supported.');
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height || width * height > maxInputPixels) throw new ImageConversionError('pixels_too_large', 'Decoded image exceeds the pixel limit.');
  if ((metadata.pages ?? 1) > 1) throw new ImageConversionError('unsupported_format', 'Animated or multi-page images are not supported.');

  const pipeline = sharp(source, { limitInputPixels: maxInputPixels, failOn: 'warning' });
  if (options.width || options.height) pipeline.resize(options.width, options.height, { fit: 'inside', withoutEnlargement: true });
  const formatOptions = options.quality === undefined ? {} : { quality: options.quality };
  try {
    const result = await withTimeout(pipeline.toFormat(options.outputFormat as keyof FormatEnum, formatOptions).toBuffer({ resolveWithObject: true }), timeoutMs);
    if (result.data.byteLength > maxOutputBytes) throw new ImageConversionError('output_too_large', 'Converted image exceeds the output byte limit.');
    return { data: result.data, mimeType: mimeTypes[options.outputFormat], format: options.outputFormat, width: result.info.width, height: result.info.height, bytes: result.data.byteLength, inputFormat, inputBytes: source.byteLength };
  } catch (error) {
    if (error instanceof ImageConversionError) throw error;
    throw new ImageConversionError('conversion_failed', 'Image conversion failed.');
  }
}
