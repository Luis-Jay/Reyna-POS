export function getProductImageSrc(imagePath?: string | null) {
  if (!imagePath) return ''
  return window.api.assets.getProductImageUrl(imagePath)
}

// Resize + JPEG-compress an image dataUrl to keep DB rows small.
// Phone photos can be 5–12 MB raw; this gets them to ~50–200 KB.
export function compressImage(dataUrl: string, maxDim = 800, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}
