/** Longest side of an uploaded receipt photo, in pixels (ADR-0017). */
export const MAX_PHOTO_EDGE = 1600
const JPEG_QUALITY = 0.8

/** Size that fits inside `max` on the long edge. Never enlarges. */
export function fitWithin(width: number, height: number, max: number) {
  const longEdge = Math.max(width, height)
  if (longEdge <= max) return { width, height }
  const scale = max / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

type Decoded = { width: number; height: number; close?: () => void }

export type PhotoCodec = {
  decode: (file: File) => Promise<Decoded>
  encode: (
    image: Decoded,
    size: { width: number; height: number },
  ) => Promise<Blob | null>
}

const browserCodec: PhotoCodec = {
  // `from-image` applies the EXIF orientation, so the pixels come out upright.
  decode: (file) => createImageBitmap(file, { imageOrientation: 'from-image' }),
  encode: (image, size) => {
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    canvas
      .getContext('2d')
      ?.drawImage(image as ImageBitmap, 0, 0, size.width, size.height)
    return new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
  },
}

/**
 * Shrink a photo to at most 1600 px on the long edge as a JPEG, upright.
 * A photo already within the limit, or one the browser can't decode, comes
 * back untouched so the upload still goes ahead.
 */
export async function shrinkPhoto(
  file: File,
  codec: PhotoCodec = browserCodec,
): Promise<File> {
  try {
    const image = await codec.decode(file)
    try {
      const size = fitWithin(image.width, image.height, MAX_PHOTO_EDGE)
      const resized = size.width !== image.width || size.height !== image.height
      if (!resized && file.type === 'image/jpeg') return file
      const blob = await codec.encode(image, size)
      if (!blob || (!resized && blob.size >= file.size)) return file
      return new File([blob], file.name.replace(/\.[^./]+$/, '') + '.jpg', {
        type: 'image/jpeg',
      })
    } finally {
      image.close?.()
    }
  } catch {
    return file
  }
}
