import { useEffect, useRef } from 'react'

// Keyboard-wedge scanner hook. USB and Bluetooth barcode scanners present as
// keyboards: they emit a fast burst of characters followed by Enter. We buffer
// keystrokes and, when Enter arrives within the buffer window, treat the whole
// buffer as a scanned barcode. Manual typing is intentionally slower, so a
// human pressing Enter after a single digit won't be misread as a scan.
export function useKeyboardWedgeScanner(onScan: (code: string) => void) {
  const buf = useRef('')
  const lastTime = useRef(0)
  const cb = useRef(onScan)
  cb.current = onScan

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const now = Date.now()
      // Ignore when typing in a form field that isn't a scan entry? No — we
      // still want scanning to work anywhere. Only consider Enter.
      if (e.key === 'Enter') {
        if (buf.current.length >= 3 && now - lastTime.current <= 600) {
          const code = buf.current
          buf.current = ''
          lastTime.current = now
          e.preventDefault()
          cb.current(code)
          return
        }
        buf.current = ''
        lastTime.current = now
        return
      }
      // Accumulate printable characters at scanner speed (<=80ms apart).
      if (e.key.length === 1 && now - lastTime.current <= 120) {
        buf.current += e.key
        lastTime.current = now
      } else {
        buf.current = e.key.length === 1 ? e.key : ''
        lastTime.current = now
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}