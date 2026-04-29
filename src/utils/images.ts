export function getProductImageSrc(imagePath?: string | null) {
  if (!imagePath) return ''
  return window.api.assets.getProductImageUrl(imagePath)
}
