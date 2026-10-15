import { describe, expect, it } from 'vitest'
import { fitWithin, shrinkPhoto, type PhotoCodec } from '@/lib/photo'

describe('fitWithin', () => {
  it('shrinks the long edge to the limit, keeping the ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('never enlarges a small photo', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 })
  })
})

function codec(width: number, height: number, bytes = 10) {
  const calls: { width: number; height: number }[] = []
  const fake: PhotoCodec = {
    decode: async () => ({ width, height }),
    encode: async (_image, size) => {
      calls.push(size)
      return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
    },
  }
  return { fake, calls }
}

describe('shrinkPhoto', () => {
  it('re-encodes a big photo as a JPEG within 1600 px', async () => {
    const { fake, calls } = codec(4032, 3024)
    const file = new File([new Uint8Array(500)], 'IMG_1.PNG', {
      type: 'image/png',
    })
    const out = await shrinkPhoto(file, fake)
    expect(calls).toEqual([{ width: 1600, height: 1200 }])
    expect(out.type).toBe('image/jpeg')
    expect(out.name).toBe('IMG_1.jpg')
  })

  it('leaves a small JPEG alone', async () => {
    const { fake, calls } = codec(800, 600)
    const file = new File([new Uint8Array(50)], 'a.jpg', { type: 'image/jpeg' })
    expect(await shrinkPhoto(file, fake)).toBe(file)
    expect(calls).toEqual([])
  })

  it('keeps the original when the browser cannot decode it', async () => {
    const file = new File([new Uint8Array(50)], 'a.heic', {
      type: 'image/heic',
    })
    const broken: PhotoCodec = {
      decode: async () => {
        throw new Error('nope')
      },
      encode: async () => null,
    }
    expect(await shrinkPhoto(file, broken)).toBe(file)
  })
})
