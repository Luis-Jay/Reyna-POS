function openAndPrint(html: string): { success: boolean; error?: string } {
  try {
    const isApple = (() => {
      if (typeof navigator === 'undefined') return false
      const ua = navigator.userAgent || ''
      const isIOS = /iPad|iPhone|iPod/.test(ua)
      const isIPadDesktop = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
      return (isIOS || isIPadDesktop) && /AppleWebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    })()

    if (isApple) {
      const w = window.open('', '_blank', 'noopener,noreferrer,width=800,height=900')
      if (!w) return { success: false, error: 'Unable to open print window.' }
      w.document.open()
      w.document.write(
        html.replace('</body>',
          `<script>window.addEventListener('load',()=>{setTimeout(()=>{try{window.focus();window.print();}catch{}},250)});window.addEventListener('afterprint',()=>{setTimeout(()=>{try{window.close();}catch{}},150)});<\/script></body>`)
      )
      w.document.close()
      return { success: true }
    }

    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:210mm;height:297mm;border:none;visibility:hidden;'
    document.body.appendChild(iframe)
    iframe.onload = () => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => {
        try { document.body.removeChild(iframe) } catch {}
        URL.revokeObjectURL(url)
      }, 2000)
    }
    iframe.src = url
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message }
  }
}

export const documentsApi = {
  // In the browser, "save as PDF" is just "print → Save as PDF"
  savePdf: async (options: { title?: string; fileName?: string; html: string }) => {
    return openAndPrint(options.html)
  },

  printHtml: async (options: { html: string; title?: string }) => {
    return openAndPrint(options.html)
  },
}
