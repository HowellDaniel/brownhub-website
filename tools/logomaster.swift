// Cut the studio's own logo out of its vector master and publish it as a PNG at the
// sizes a search engine and a visitor actually ask for.
//
// The master is tools/logo-master.pdf — the same lockup the nav already shows, but as
// curves rather than pixels. The mark occupies about 14 x 12 points of an A4-ish sheet, so
// a whole-page raster would have to be ~30,000 px wide before a 1024 px logo was real
// pixels rather than an upscale. Instead the ink box is measured from one modest raster,
// converted back into PDF user space, and the page is drawn a second time with the canvas
// scaled around that box — so the curves are rasterised at exactly the size asked for.
//
// Enlarging images/logo.png (240 px, what the site has carried since the boot-bytes pass
// shrank it) would only enlarge its blur, and Google wants a raster of at least 200 px,
// 512 recommended, for the logo it puts beside the business.
//
// Nothing here assumes where the mark sits: the ink box comes from alpha, and the finished
// canvas is measured again so a wrong space conversion fails loudly instead of publishing
// a blank or half-a-mark PNG.
//
//   swiftc -O tools/logomaster.swift -o /tmp/logomaster
//   /tmp/logomaster measure <master.pdf> <page 1-based>
//   /tmp/logomaster cut <master.pdf> <page> <out.png> <size> [pad%]
//
// measure prints the ink box and its aspect. cut writes a square, transparent canvas of
// <size> with the mark centred inside a pad% margin.

import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count >= 4 else { fail("usage: logomaster <measure|cut> <master.pdf> <page> [out.png size pad%]") }
let mode = args[1]
guard let cgDoc = CGPDFDocument(URL(fileURLWithPath: args[2]) as CFURL) else {
    fail("cannot open \(args[2])")
}
guard let pageNum = Int(args[3]), pageNum >= 1, pageNum <= cgDoc.numberOfPages,
      let pdfPage = cgDoc.page(at: pageNum) else {
    fail("no page \(args[3]) in \(cgDoc.numberOfPages) pages")
}
guard let cs = CGColorSpace(name: CGColorSpace.sRGB) else { fail("no sRGB") }

// PDF user space of the page. CoreGraphics draws a page at one unit per point, so the only
// thing that decides the resolution of a PNG is the canvas's own CTM.
let media = pdfPage.getBoxRect(.mediaBox)

func canvas(_ width: Int, _ height: Int) -> CGContext {
    guard let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                              space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        fail("cannot make a \(width)x\(height) canvas")
    }
    return ctx
}

// Paint the page so that the PDF point (originX, originY) lands on the canvas's bottom-left
// corner at scale px-per-point. Everything outside the canvas is clipped, not resampled.
func paint(_ ctx: CGContext, _ scale: CGFloat, _ originX: CGFloat, _ originY: CGFloat) {
    ctx.scaleBy(x: scale, y: scale)
    ctx.translateBy(x: -originX, y: -originY)
    ctx.drawPDFPage(pdfPage)
}

// Ink box of an RGBA raster, counted from the top-left of the picture the way a reader
// looks at it. The alpha threshold catches a hairline and drops dust.
func inkBox(_ px: UnsafeMutableRawPointer, _ width: Int, _ height: Int) -> (minX: Int, minY: Int, maxX: Int, maxY: Int)? {
    let p = px.bindMemory(to: UInt8.self, capacity: width * height * 4)
    var minX = width, minY = height, maxX = -1, maxY = -1
    for y in 0..<height {
        let row = y * width * 4
        for x in 0..<width where p[row + x * 4 + 3] > 8 {
            if x < minX { minX = x }
            if x > maxX { maxX = x }
            if y < minY { minY = y }
            if y > maxY { maxY = y }
        }
    }
    guard maxX >= 0 else { return nil }
    return (minX, minY, maxX, maxY)
}

// The first pass only has to locate the mark. One pixel is a tenth of a point here, which
// is finer than any margin the crop adds, so the measurement never limits the framing.
let PROBE_W = 4096
let probeScale = CGFloat(PROBE_W) / media.width
let probeH = Int((media.height * probeScale).rounded())
let probe = canvas(PROBE_W, probeH)
paint(probe, probeScale, media.minX, media.minY)
guard let probePixels = probe.data else { fail("the probe canvas has no pixels") }

guard let ink = inkBox(probePixels, PROBE_W, probeH) else {
    fail("page \(pageNum) rendered with no ink at all — wrong page, or the master lost its artwork")
}
let inkW = ink.maxX - ink.minX + 1, inkH = ink.maxY - ink.minY + 1
print("page \(pageNum) mediaBox \(Int(media.width))x\(Int(media.height))pt")
print("ink box x \(ink.minX)..\(ink.maxX) y \(ink.minY)..\(ink.maxY) = \(inkW)x\(inkH)  aspect "
    + String(format: "%.4f", Double(inkW) / Double(inkH)))
if mode == "measure" { exit(0) }

guard mode == "cut" else { fail("unknown mode \(mode)") }
guard args.count >= 6, let size = Int(args[5]), size >= 200 else { fail("cut needs an out.png and a size of at least 200") }
let pad = args.count >= 7 ? (Double(args[6]) ?? 6) : 6
guard pad >= 0, pad <= 50 else { fail("pad% must sit between 0 and 50") }

// Convert the measured pixels back to PDF points. Row 0 of the buffer is the top of the
// picture while PDF y counts up from the bottom, so the two meet at media.maxY.
let inkX0 = media.minX + CGFloat(ink.minX) / probeScale
let inkX1 = media.minX + CGFloat(ink.maxX + 1) / probeScale
let inkY0 = media.maxY - CGFloat(ink.maxY + 1) / probeScale
let inkY1 = media.maxY - CGFloat(ink.minY) / probeScale

// One square that holds the mark plus its margin: grow the short side to the long side,
// then add the margin to both, so the aspect of the artwork is never distorted.
let sidePt = max(inkX1 - inkX0, inkY1 - inkY0) * (1 + CGFloat(pad / 100))
guard sidePt <= media.width, sidePt <= media.height else {
    fail("a \(pad)% margin around the mark is bigger than the master page — lower the pad")
}
// Slide the square back onto the sheet rather than shrink it: a mark pushed to one side of
// the canvas is a cosmetic nuisance, a mark clipped by the page edge is a broken logo.
var originX = (inkX0 + inkX1) / 2 - sidePt / 2
var originY = (inkY0 + inkY1) / 2 - sidePt / 2
originX = max(media.minX, min(media.maxX - sidePt, originX))
originY = max(media.minY, min(media.maxY - sidePt, originY))
let outScale = CGFloat(size) / sidePt
print("crop " + String(format: "%.2f,%.2f", originX, originY) + " side "
    + String(format: "%.2f", sidePt) + "pt  ->  " + String(format: "%.1f", outScale) + " px/pt")

let out = canvas(size, size)
paint(out, outScale, originX, originY)
guard let image = out.makeImage(), let outPixels = out.data else { fail("cannot rasterise the crop") }

// Prove the conversion pointed at the artwork: the mark has to fill the canvas it was
// framed for. A flipped y would land on blank paper, and a blank PNG would publish quietly.
guard let laid = inkBox(outPixels, size, size) else {
    fail("the \(size)px canvas holds no ink — the crop box missed the artwork")
}
let fillW = Double(laid.maxX - laid.minX + 1) / Double(size)
let fillH = Double(laid.maxY - laid.minY + 1) / Double(size)
print("canvas ink \(laid.maxX - laid.minX + 1)x\(laid.maxY - laid.minY + 1) = "
    + String(format: "%.0f%% x %.0f%%", fillW * 100, fillH * 100) + " of the \(size)px square")
guard fillW > 0.4, fillH > 0.4, fillW < 1.0, fillH < 1.0 else {
    fail("the mark covers " + String(format: "%.0f%%/%.0f%%", fillW * 100, fillH * 100)
        + " of the canvas — the framing is wrong, refusing to write")
}

let dst = URL(fileURLWithPath: args[4])
guard let dest = CGImageDestinationCreateWithURL(dst as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    fail("cannot make a PNG at \(args[4])")
}
CGImageDestinationAddImage(dest, image, nil)
guard CGImageDestinationFinalize(dest) else { fail("cannot write \(args[4])") }
print("wrote \(args[4]) \(size)x\(size)")
