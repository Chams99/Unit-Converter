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
