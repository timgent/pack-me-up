import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/** Empty squares around the code, in modules. Scanners need this to lock on. */
const QUIET_ZONE = 2

/**
 * A QR code, as SVG React renders rather than markup injected into the page.
 *
 * It is here because the commonest way two people share a packing list is
 * sitting next to each other, and reading a WebID aloud — "aitch tee tee pee
 * ess colon slash slash…" — is not a thing anyone should be asked to do. A code
 * on one screen and a camera on the other skips the whole exchange.
 *
 * The whole grid goes into a single `<path>`: a 33×33 code is over a thousand
 * squares, and a thousand `<rect>` elements is a lot of DOM to draw a square
 * with. `viewBox` does the sizing, so the code stays sharp at any size and the
 * caller styles it with CSS like anything else.
 */
export function QrCode({ value, label, className }: {
    value: string
    /** What a screen reader should call it — this is a picture of an address. */
    label: string
    className?: string
}) {
    const code = useMemo(() => {
        if (value === '') return null
        try {
            // Type 0 = smallest that fits; 'M' tolerates ~15% damage, which is
            // the usual choice for a code on a screen.
            const qr = qrcode(0, 'M')
            qr.addData(value)
            qr.make()

            const count = qr.getModuleCount()
            let path = ''
            for (let row = 0; row < count; row++) {
                for (let col = 0; col < count; col++) {
                    if (qr.isDark(row, col)) path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`
                }
            }
            return { path, size: count + QUIET_ZONE * 2 }
        } catch {
            // Only reachable if the data is too big for any QR version. The
            // address is on screen beside this anyway, so losing the picture
            // costs nothing.
            return null
        }
    }, [value])

    if (!code) return null

    return (
        <svg
            role="img"
            aria-label={label}
            viewBox={`0 0 ${code.size} ${code.size}`}
            className={className}
            // White stays white in dark mode on purpose: a QR code inverted is
            // one many scanners will not read.
            style={{ backgroundColor: '#ffffff' }}
            shapeRendering="crispEdges"
        >
            <path d={code.path} fill="#000000" />
        </svg>
    )
}
