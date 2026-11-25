// ضغط الصورة في المتصفح قبل رفعها: أقصى بُعد 1200 بكسل، JPEG بجودة 0.8
export const MAX_INPUT_BYTES = 15 * 1024 * 1024

export async function compressImage(file, maxDim = 1200, quality = 0.8) {
  if (!file || !file.type.startsWith('image/')) throw new Error('الملف ليس صورة')
  if (file.size > MAX_INPUT_BYTES) throw new Error('حجم الصورة أكبر من 15 ميجابايت')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error('تعذّر قراءة الصورة'))
      i.src = url
    })
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob) throw new Error('تعذّر ضغط الصورة')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const blobToDataUrl = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(blob)
  })
