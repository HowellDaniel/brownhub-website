// Cut a company's own artwork into a client-wall mark: key the white paper out to
// transparency, trim to the art, resample to the width the wall wants.
//
//   swiftc -O tools/clientmark.swift -o /tmp/clientmark
//   /tmp/clientmark analyze <source-image>
//   /tmp/clientmark cut <source-image> <out.png> <target-width>
//
// analyze prints the EXIF orientation, the art bounding box and whether that box
// touches an edge of the source — a mark that runs off the frame was photographed
// or exported too tight, and the wall would show a letter cut in half.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: clientmark <analyze|cut> <source> [out.png width]\n".data(using: .utf8)!)
    exit(2)
}
let mode = args[1]
let srcURL = URL(fileURLWithPath: args[2])
guard let isrc = CGImageSourceCreateWithURL(srcURL as CFURL, nil),
      let src = CGImageSourceCreateImageAtIndex(isrc, 0, nil) else {
    FileHandle.standardError.write("cannot read \(args[2])\n".data(using: .utf8)!)
    exit(1)
}

let W = src.width, H = src.height
var props: CFDictionary? = CGImageSourceCopyPropertiesAtIndex(isrc, 0, nil)
let exif = (props as? [CFString: Any])?[kCGImagePropertyExifDictionary] as? [CFString: Any]
let tiff = (props as? [CFString: Any])?[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
let orient = (tiff?[kCGImagePropertyTIFFOrientation] as? Int) ?? 1

// Read every pixel into a plain RGBA buffer, un-premultiplied.
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
var buf = [UInt8](repeating: 0, count: W * H * 4)
guard let ctx = buf.withUnsafeMutableBytes({ ptr in
    CGContext(data: ptr.baseAddress, width: W, height: H, bitsPerComponent: 8,
              bytesPerRow: W * 4, space: cs,
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
}) else { print("cannot allocate bitmap"); exit(1) }
ctx.draw(src, in: CGRect(x: 0, y: 0, width: W, height: H))

// "How far from white" is the alpha the paper never had. A pixel that is exactly
// white is the background; a pixel that is 250,250,252 is paper in shadow and still
// background. The ink's own colour is kept as it was photographed: the wall's plate
// is near-white (#fffbf7), so compositing the observed pixel over that plate gives
// back the observed pixel. Un-blending it against the paper instead would need the
// true ink colour, which a JPEG does not carry — and guessing it from the darkest
// channel makes a saturated brand red read as 88% transparent, which is a bug, not a
// keying. Anything past `hi` is solid ink; anything under `lo` is paper.
let lo = 8.0, hi = 64.0
func alphaAt(_ x: Int, _ y: Int) -> Double {
    let i = (y * W + x) * 4
    let r = Double(buf[i]), g = Double(buf[i + 1]), b = Double(buf[i + 2])
    return (255.0 - min(min(r, g), b)) / 255.0
}
func keyedAlpha(_ x: Int, _ y: Int) -> Double {
    let d = alphaAt(x, y) * 255.0
    return max(0, min(1, (d - lo) / (hi - lo)))
}

var minX = W, minY = H, maxX = -1, maxY = -1
for y in 0..<H { for x in 0..<W where alphaAt(x, y) * 255.0 > lo {
    if x < minX { minX = x }; if x > maxX { maxX = x }
    if y < minY { minY = y }; if y > maxY { maxY = y }
}}
guard maxX >= 0 else { print("no ink found — the source is all white"); exit(1) }

let bw = maxX - minX + 1, bh = maxY - minY + 1
print("source            \(W)x\(H)  exif-orientation=\(orient)  \(src.alphaInfo == .none ? "opaque" : "has alpha")")
print("art bbox          x=\(minX) y=\(minY) \(bw)x\(bh)  (aspect \(String(format: "%.2f", Double(bw)/Double(bh))))")
print("touches edges     left=\(minX == 0) right=\(maxX == W-1) top=\(minY == 0) bottom=\(maxY == H-1)")

if mode == "analyze" {
    // Row profile: how tall each inked band is, so a band that is cut off mid-letter
    // can be told from one that simply ends.
    print("row profile (every \(max(1, bh / 20)) rows):")
    let step = max(1, bh / 20)
    var y = minY
    while y <= maxY {
        var n = 0
        for yy in y..<min(y + step, maxY + 1) { for x in minX...maxX where alphaAt(x, yy) * 255.0 > lo { n += 1 } }
        let bar = String(repeating: "#", count: max(0, min(60, n * 60 / (bw * step))))
        print(String(format: "  %5d  %6d  %@", y - minY, n, bar))
        y += step
    }
    exit(0)
}

guard args.count >= 5, let targetW = Int(args[4]) else {
    FileHandle.standardError.write("usage: clientmark cut <source> <out.png> <target-width>\n".data(using: .utf8)!)
    exit(2)
}
let outPath = args[3]

// Key at full resolution, then resample: an edge pixel gets its alpha from how far it
// is from paper, and scaling first would blend the paper into the ink before the key
// could tell them apart. The buffer is built premultiplied because that is what a
// context draws, and a resample of premultiplied pixels is the one thing that does not
// drag a dark fringe out of the empty ones.
let scale = Double(targetW) / Double(bw)
let outW = targetW, outH = max(1, Int((Double(bh) * scale).rounded()))
var small = [UInt8](repeating: 0, count: outW * outH * 4)

var pre = [UInt8](repeating: 0, count: bw * bh * 4)
for y in 0..<bh { for x in 0..<bw {
    let sx = minX + x, sy = minY + y
    let si = (sy * W + sx) * 4, di = (y * bw + x) * 4
    let a = keyedAlpha(sx, sy)
    pre[di + 3] = UInt8((a * 255).rounded())
    for c in 0..<3 { pre[di + c] = UInt8(Double(buf[si + c]) * a) }
}}
let preProvider = CGDataProvider(data: Data(bytes: &pre, count: pre.count) as CFData)!
guard let preImg = CGImage(width: bw, height: bh, bitsPerComponent: 8, bitsPerPixel: 32,
                           bytesPerRow: bw * 4, space: cs,
                           bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                           provider: preProvider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
else { print("cannot wrap premultiplied art"); exit(1) }

guard let octx = small.withUnsafeMutableBytes({ ptr in
    CGContext(data: ptr.baseAddress, width: outW, height: outH, bitsPerComponent: 8,
              bytesPerRow: outW * 4, space: cs,
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
}) else { print("cannot allocate output"); exit(1) }
octx.interpolationQuality = .high
octx.setShouldAntialias(true)
octx.draw(preImg, in: CGRect(x: 0, y: 0, width: outW, height: outH))

let outProvider = CGDataProvider(data: Data(bytes: &small, count: small.count) as CFData)!
guard let outImg = CGImage(width: outW, height: outH, bitsPerComponent: 8, bitsPerPixel: 32,
                           bytesPerRow: outW * 4, space: cs,
                           bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                           provider: outProvider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
else { print("cannot wrap output"); exit(1) }

let outURL = URL(fileURLWithPath: outPath)
guard let dest = CGImageDestinationCreateWithURL(outURL as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    print("cannot create PNG destination"); exit(1)
}
CGImageDestinationAddImage(dest, outImg, nil)
guard CGImageDestinationFinalize(dest) else { print("cannot write PNG"); exit(1) }

var opaque = 0, partial = 0
for i in stride(from: 0, to: outW * outH * 4, by: 4) {
    if small[i + 3] > 250 { opaque += 1 } else if small[i + 3] > 8 { partial += 1 }
}
let total = outW * outH
let bytes = (try? Data(contentsOf: outURL).count) ?? 0
print("wrote             \(outPath) \(outW)x\(outH)  \(bytes) bytes")
print("coverage          solid \(String(format: "%.1f", Double(opaque) * 100 / Double(total)))%  edged \(String(format: "%.1f", Double(partial) * 100 / Double(total)))%")
