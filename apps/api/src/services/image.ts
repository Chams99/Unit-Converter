import sharp, { type FormatEnum, type Metadata } from 'sharp';
import { ImageConversionError, type ImageArtifact, type ImageConvertOptions, type ImageOutputFormat } from './image-types.js';
export { ImageConversionError, type ImageArtifact, type ImageConvertOptions, type ImageOutputFormat } from './image-types.js';

const mimeTypes: Record<ImageOutputFormat, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', tiff: 'image/tiff', gif: 'image/gif' };
const formats: readonly ImageOutputFormat[] = ['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'];

function hasRasterSignature(input: Buffer): boolean {
  if (input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return true;
  if (input.length >= 3 && input[0] === 255 && input[1] === 216 && input[2] === 255) return true;
  if (input.subarray(0, 4).toString('ascii') === 'RIFF' && input.subarray(8, 12).toString('ascii') === 'WEBP') return true;
  if (['GIF87a', 'GIF89a'].includes(input.subarray(0, 6).toString('ascii'))) return true;
  if (['49492a00', '4d4d002a', '49492b00', '4d4d002b'].includes(input.subarray(0, 4).toString('hex'))) return true;
  if (input.length >= 16 && input.subarray(4, 8).toString('ascii') === 'ftyp') {
    const size = input.readUInt32BE(0);
    if (size < 16 || size > Math.min(input.length, 1024)) return false;
    for (let offset = 8; offset + 4 <= size; offset += 4) {
      if (offset !== 12 && ['avif', 'avis'].includes(input.subarray(offset, offset + 4).toString('ascii'))) return true;
    }
  }
  return false;
}

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
  if (!hasRasterSignature(source)) throw new ImageConversionError('unsupported_format', 'Input is not an allowed raster image.');
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
