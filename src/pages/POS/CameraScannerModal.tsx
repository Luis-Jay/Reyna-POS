import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike
  }
}

type Props = {
  onClose: () => void
  onDetected: (code: string) => Promise<void> | void
}

const SUPPORTED_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'codabar',
  'qr_code',
]

export default function CameraScannerModal({ onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectorRef = useRef<BarcodeDetectorLike | null>(null)
  const lastDetectedRef = useRef<{ code: string; time: number } | null>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true

    const stopStream = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop()
        }
        streamRef.current = null
      }
    }

    const scanFrame = async () => {
      if (!mounted || !videoRef.current || !detectorRef.current) return

      try {
        const results = await detectorRef.current.detect(videoRef.current)
        const code = results.find(result => typeof result.rawValue === 'string' && result.rawValue.trim())?.rawValue?.trim()

        if (code) {
          const now = Date.now()
          const last = lastDetectedRef.current
          if (!last || last.code !== code || now - last.time > 2000) {
            lastDetectedRef.current = { code, time: now }
            try {
              await onDetected(code)
            } catch (error) {
              console.error('Error handling detected code:', error)
            } finally {
              onClose()
            }
            return
          }
        }
      } catch {
        // Ignore transient camera/detection errors and keep scanning.
      }

      rafRef.current = requestAnimationFrame(() => {
        void scanFrame()
      })
    }

    const start = async () => {
      if (!window.BarcodeDetector) {
        setError('Camera barcode scanning is not available on this device yet.')
        return
      }

      try {
        detectorRef.current = new window.BarcodeDetector({ formats: SUPPORTED_FORMATS })
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })

        if (!mounted) {
          for (const track of stream.getTracks()) track.stop()
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        setReady(true)
        void scanFrame()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to access the camera.')
      }
    }

    void start()

    return () => {
      mounted = false
      stopStream()
    }
  }, [onClose, onDetected])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/70">Camera Scan</p>
            <h2 className="text-xl font-semibold">Use Camera as Scanner</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-white/10 bg-white/5 p-2 text-white transition hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-black">
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline autoPlay />
            <div className="pointer-events-none absolute inset-x-10 top-1/2 h-20 -translate-y-1/2 rounded-2xl border-2 border-emerald-300/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" />
          </div>

          <div className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm text-white/80">
            {error
              ? error
              : ready
                ? 'Point the barcode at the camera. The item will be added automatically once detected.'
                : 'Starting camera...'}
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-white/65">
            <Camera size={16} />
            <span>Best results come from clear lighting and a steady barcode inside the frame.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
