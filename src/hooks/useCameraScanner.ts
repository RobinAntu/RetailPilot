import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser'

// Camera barcode scanner using ZXing. Returns the video element ref to attach
// and exposes the latest decoded code + an active flag.
export function useCameraScanner(onScan: (code: string) => void) {
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const cb = useRef(onScan)
  cb.current = onScan

  const start = async () => {
    if (active) return
    try {
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, err) => {
        if (result) {
          controls.stop()
          setActive(false)
          cb.current(result.getText())
        }
      })
      controlsRef.current = controls
      setActive(true)
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Camera unavailable')
      setActive(false)
    }
  }

  const stop = () => {
    controlsRef.current?.stop()
    setActive(false)
  }

  useEffect(() => () => controlsRef.current?.stop(), [])

  return { videoRef, active, error, start, stop }
}