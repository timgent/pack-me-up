/**
 * `qrcode-generator` ships no types of its own, and the DefinitelyTyped package
 * describes only its string-building helpers (`createSvgTag` and friends) —
 * which this app deliberately does not use, because they hand back markup to
 * inject rather than something React can render.
 *
 * So this declares the half of the library we do use: the module grid, read a
 * square at a time, which `QrCode` turns into one SVG path.
 */
declare module 'qrcode-generator' {
    interface QRCode {
        addData(data: string): void
        make(): void
        /** Squares per side, including neither quiet zone nor margin. */
        getModuleCount(): number
        isDark(row: number, col: number): boolean
    }

    /** `typeNumber` 0 picks the smallest size the data fits into. */
    const qrcode: (typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H') => QRCode
    export default qrcode
}
