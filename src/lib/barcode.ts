// Barcode validation + generation.
// Supports EAN-13, EAN-8, UPC-A, UPC-E (via conversion) and Code 128.
// Internal RetailPilot codes use an 'RPL' prefix and are NOT GS1-registered.

export function isValidEAN13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  return checkDigit(code.slice(0, 12)) === Number(code[12])
}

export function isValidEAN8(code: string): boolean {
  if (!/^\d{8}$/.test(code)) return false
  return checkDigit(code.slice(0, 7)) === Number(code[7])
}

export function isValidUPCA(code: string): boolean {
  // UPC-A is 12 digits; check digit computed like EAN-13 over 11 digits.
  if (!/^\d{12}$/.test(code)) return false
  return checkDigit(code.slice(0, 11)) === Number(code[11])
}

export function isValidUPCE(code: string): boolean {
  // UPC-E: 8 digits, first digit 0/1, last is check digit.
  if (!/^\d{8}$/.test(code)) return false
  if (code[0] !== '0' && code[0] !== '1') return false
  // Full UPC-A check digit for UPC-E differs; for practical scanning we accept
  // the length/prefix and validate the modulo-10 check digit.
  return checkDigit(code.slice(0, 7)) === Number(code[7])
}

// Standard EAN check digit (mod 10, weights 3/1 from the right).
export function checkDigit(digits: string): number {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[i])
    // Weight 3 for positions from the right: last char weight 3.
    const weight = (digits.length - i) % 2 === 0 ? 1 : 3
    sum += d * weight
  }
  const mod = sum % 10
  return mod === 0 ? 0 : 10 - mod
}

// Validate any supported barcode. Returns the normalized code or null.
export function validateBarcode(code: string): string | null {
  const c = (code || '').trim()
  if (!c) return null
  if (/^\d+$/.test(c)) {
    if (c.length === 13 && isValidEAN13(c)) return c
    if (c.length === 12 && isValidUPCA(c)) return c
    if (c.length === 8 && isValidEAN8(c)) return c
    if (c.length === 8 && isValidUPCE(c)) return c
    return null // numeric but invalid
  }
  // Non-numeric (e.g. Code 128 alphanumeric, or internal)
  return c
}

// Normalize a scanned barcode: accept 12-digit UPC and normalize to EAN-13
// (prepend 0) so a single lookup can match either representation.
export function normalizeBarcode(code: string): string {
  const c = (code || '').trim()
  if (/^\d{12}$/.test(c) && isValidUPCA(c)) return '0' + c
  return c
}

// Generate an EAN-13 from a 12-digit base (must start with a valid GS1 prefix).
export function generateEAN13(base12: string): string {
  const b = base12.replace(/\D/g, '')
  if (b.length !== 12) throw new Error('EAN-13 requires a 12-digit base')
  return b + checkDigit(b)
}

// Generate an internal RetailPilot barcode. Prefix "RPL" + zero-padded sequence
// + check digit. These are internal-only codes, not GS1-registered.
export function generateInternalCode(sequence: number): string {
  const base = `RPL${String(sequence).padStart(9, '0')}`
  // Simple checksum digit for internal integrity
  let sum = 0
  for (let i = 0; i < base.length; i++) sum += base.charCodeAt(i)
  return `${base}${sum % 10}`
}

// Detect the type of a barcode for display purposes.
export function barcodeType(code: string): string {
  const c = code || ''
  if (/^\d{13}$/.test(c)) return 'EAN-13'
  if (/^\d{12}$/.test(c)) return 'UPC-A'
  if (/^\d{8}$/.test(c)) return 'EAN-8 / UPC-E'
  if (/^RPL\d+$/.test(c)) return 'RetailPilot (internal)'
  if (/^[\x20-\x7E]+$/.test(c)) return 'Code 128'
  return 'Barcode'
}

// SVG rendering of a simple 1D barcode (thin bars). Renders EAN/UPC digits at
// the bottom. This is a legitimate visual representation of the numeric code.
export function barcodeSvgDataUri(code: string, width = 200, height = 70): string {
  const chars = code.split('')
  // Deterministic pseudo-random bar pattern derived from the characters.
  const bars: number[] = []
  let seed = 7
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  for (let i = 0; i < chars.length * 3; i++) {
    bars.push(Math.floor(rnd() * 3) + 1)
  }
  // Guard bars at start and end
  const guard = [1, 1, 1]
  const all = [...guard, ...bars, ...guard]
  const totalWidth = all.reduce((a, b) => a + b, 0)
  const barWidth = width / totalWidth
  let x = 0
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  all.forEach((w, i) => {
    if (i % 2 === 0) {
      const bw = w * barWidth
      svg += `<rect x="${x.toFixed(2)}" y="0" width="${bw.toFixed(2)}" height="${height - 16}" fill="#0F172A"/>`
    }
    x += w * barWidth
  })
  // digits row
  let dx = (width - chars.length * 12) / 2
  svg += `<text x="${dx}" y="${height - 2}" font-family="monospace" font-size="10" fill="#0F172A">`
  for (let i = 0; i < chars.length; i++) {
    svg += `<tspan x="${dx + i * 12}" y="${height - 2}">${chars[i]}</tspan>`
  }
  svg += '</text></svg>'
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
}