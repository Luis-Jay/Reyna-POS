import { BrowserWindow } from 'electron'
import { IPC } from '../../../shared/ipc-channels'

export class BarcodeService {
  private buffer = ''
  private timer: NodeJS.Timeout | null = null
  private readonly TIMEOUT_MS = 80
  private readonly MIN_LENGTH = 4

  constructor(private win: BrowserWindow) {}

  init() {
    this.win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return

      if (input.key === 'Enter') {
        if (this.buffer.length >= this.MIN_LENGTH) {
          this.emit(this.buffer)
        }
        this.reset()
        return
      }

      if (input.key.length === 1 && /[\w\-]/.test(input.key)) {
        this.buffer += input.key
        this.resetTimer()
      }
    })
  }

  private resetTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      if (this.buffer.length >= this.MIN_LENGTH) {
        this.emit(this.buffer)
      }
      this.reset()
    }, this.TIMEOUT_MS)
  }

  private emit(code: string) {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send(IPC.PUSH.BARCODE_SCANNED, code)
    }
  }

  private reset() {
    this.buffer = ''
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
