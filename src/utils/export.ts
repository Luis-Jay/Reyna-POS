import * as XLSX from 'xlsx'

export function exportToExcel(sheets: { name: string; rows: Record<string, any>[] }[], filename: string) {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows)
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  }
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function exportToPdf(title: string, htmlContent: string) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 24px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        p.subtitle { font-size: 11px; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #f3f4f6; text-align: left; padding: 6px 10px; font-size: 11px; border-bottom: 2px solid #e5e7eb; }
        td { padding: 5px 10px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
        .section-title { font-size: 14px; font-weight: bold; margin: 16px 0 6px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <p class="subtitle">Generated on ${new Date().toLocaleString('en-PH')}</p>
      ${htmlContent}
    </body>
    </html>
  `)
  win.document.close()
  setTimeout(() => { win.print(); win.close() }, 400)
}
