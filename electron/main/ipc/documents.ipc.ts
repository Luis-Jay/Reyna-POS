import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { IPC } from '../../../shared/ipc-channels'

type DocumentOptions = {
  title: string
  html: string
  fileName?: string
  landscape?: boolean
}

function buildHtmlDocument(title: string, html: string) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light; }
      html, body {
        margin: 0;
        padding: 0;
        background: #f3f4f6;
        color: #0f172a;
        font-family: Arial, Helvetica, sans-serif;
      }
      body {
        padding: 24px;
      }
      .document-shell {
        width: min(100%, 210mm);
        margin: 0 auto;
      }
      .document-card {
        background: #fff;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12);
      }
      @page {
        margin: 12mm;
      }
      @media print {
        html, body {
          background: #fff;
        }
        body {
          padding: 0;
        }
        .document-shell {
          width: 100%;
        }
        .document-card {
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="document-shell">
      <div class="document-card">${html}</div>
    </div>
  </body>
</html>`
}

async function withDocumentWindow<T>(title: string, html: string, action: (window: BrowserWindow, tmpFile: string) => Promise<T>) {
  const tmpFile = path.join(os.tmpdir(), `reyna_document_${Date.now()}.html`)
  fs.writeFileSync(tmpFile, buildHtmlDocument(title, html), 'utf-8')

  const printWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 1600,
    webPreferences: {
      sandbox: false,
      nodeIntegration: false,
    },
  })

  try {
    await printWindow.loadURL(`file://${tmpFile}`)
    await new Promise(resolve => setTimeout(resolve, 300))
    return await action(printWindow, tmpFile)
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close()
    }
    try { fs.unlinkSync(tmpFile) } catch {}
  }
}

export function registerDocumentHandlers() {
  ipcMain.handle(IPC.DOCUMENTS.SAVE_PDF, async (_, options: DocumentOptions) => {
    const defaultName = `${options.fileName || options.title || 'report'}.pdf`
    const { filePath } = await dialog.showSaveDialog({
      title: `Save ${options.title}`,
      defaultPath: defaultName,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    })

    if (!filePath) {
      return { success: false, cancelled: true }
    }

    try {
      await withDocumentWindow(options.title, options.html, async (printWindow) => {
        const pdf = await printWindow.webContents.printToPDF({
          printBackground: true,
          landscape: options.landscape === true,
          pageSize: 'A4',
          margins: {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
          },
        })
        fs.writeFileSync(filePath, pdf)
      })
      return { success: true, path: filePath }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to export PDF' }
    }
  })

  ipcMain.handle(IPC.DOCUMENTS.PRINT_HTML, async (_, options: DocumentOptions) => {
    try {
      await withDocumentWindow(options.title, options.html, async (printWindow) => {
        await new Promise<void>((resolve, reject) => {
          printWindow.webContents.print({
            silent: false,
            printBackground: true,
          }, (success, errorType) => {
            if (success) resolve()
            else reject(new Error(errorType || 'Print failed'))
          })
        })
      })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to print document' }
    }
  })
}
