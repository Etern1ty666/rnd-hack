import jsQR from 'jsqr'

/**
 * QR-код на счёте или квитанции по ГОСТ Р 56042-2014: «ST00012|Name=…|PersonalAcc=…|Sum=…».
 * Такие печатают на счетах все российские банки и бухгалтерии — получателя и сумму не надо вбивать руками.
 */
export interface PayQr {
  name: string
  /** В рублях; в самом коде сумма в копейках и может отсутствовать. */
  sum: number | null
  purpose: string
  inn: string
  bank: string
  account: string
}

const CHARSET: Record<string, string> = { '1': 'windows-1251', '2': 'utf-8', '3': 'koi8-r' }

export function parsePayQr(bytes: Uint8Array): PayQr | null {
  const head = String.fromCharCode(...bytes.slice(0, 8))
  if (!/^ST0001[123]/.test(head)) return null
  const text = new TextDecoder(CHARSET[head[6]]).decode(bytes)
  const f: Record<string, string> = {}
  for (const part of text.slice(8).split(text[7])) {
    const i = part.indexOf('=')
    if (i > 0) f[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim()
  }
  if (!f.name) return null
  const kop = Number(f.sum)
  return {
    name: f.name,
    sum: kop > 0 ? Math.round(kop) / 100 : null,
    purpose: f.purpose ?? '',
    inn: f.payeeinn ?? '',
    bank: f.bankname ?? '',
    account: f.personalacc ?? '',
  }
}

/** Ищет QR на картинке или кадре с камеры; большие картинки уменьшаем — так и быстрее, и надёжнее. */
export function findQr(src: CanvasImageSource, w: number, h: number, maxSide: number, canvas = document.createElement('canvas')): Uint8Array | null {
  const k = Math.min(1, maxSide / Math.max(w, h))
  canvas.width = Math.round(w * k)
  canvas.height = Math.round(h * k)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
  return code ? new Uint8Array(code.binaryData) : null
}

/** QR из файла: фото счёта или скриншот. Пробуем в двух масштабах — мелкий код на большом скане теряется при сжатии. */
export async function findQrInFile(file: Blob): Promise<Uint8Array | null> {
  const bmp = await createImageBitmap(file)
  try {
    return findQr(bmp, bmp.width, bmp.height, 1200) ?? findQr(bmp, bmp.width, bmp.height, 2400)
  } finally {
    bmp.close()
  }
}
