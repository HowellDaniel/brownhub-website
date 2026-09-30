// qrlogo <text> <out.png> <logo.png> [px] [quiet] [badge fraction]
// BrownHub QR with the studio badge in the middle. Level H correction carries a mask of
// roughly a tenth of the modules, so the centre is carved out on a clean cream disc (a
// QR is scanned by its grid, never by its fill colour, so a solid light patch reads as
// background). The finished file is decoded back with Vision and CoreImage, and Vision
// has to read the payload for this script to exit 0.
// 0.32 is the shipped size: it decodes at every rendered size down to 80px and under a
// 8px blur, and 0.40 does not decode at all, so there is no headroom above it.
import Cocoa
import CoreImage
import Vision

let a = CommandLine.arguments
guard a.count >= 4, let text = a[1].data(using: .utf8) else {
    FileHandle.standardError.write("usage: qrlogo <text> <out.png> <logo.png> [px] [quiet]\n".data(using: .utf8)!)
    exit(2)
}
let px = a.count > 4 ? (Int(a[4]) ?? 1024) : 1024
let quiet = a.count > 5 ? (Int(a[5]) ?? 4) : 4
let frac = a.count > 6 ? (Double(a[6]) ?? 0.32) : 0.32
let cream = (r: CGFloat(1.0), g: CGFloat(0.984), b: CGFloat(0.969))   // #fffbf7

func vec(_ v: [CGFloat]) -> CIVector { CIVector(values: v, count: 4) }
func die(_ m: String) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(1) }

guard let gen = CIFilter(name: "CIQRCodeGenerator") else { die("no generator filter") }
gen.setValue(text, forKey: "inputMessage")
gen.setValue("H", forKey: "inputCorrectionLevel")
guard let raw = gen.outputImage else { die("no code") }
let mods = Int(raw.extent.width.rounded())

guard let tint = CIFilter(name: "CIColorMatrix") else { die("no colour filter") }
tint.setValue(raw, forKey: "inputImage")
tint.setValue(vec([0.894, 0.0, 0.0, 0.0]), forKey: "inputRVector")
tint.setValue(vec([0.0, 0.957, 0.0, 0.0]), forKey: "inputGVector")
tint.setValue(vec([0.0, 0.0, 0.953, 0.0]), forKey: "inputBVector")
tint.setValue(vec([0.0, 0.0, 0.0, 1.0]), forKey: "inputAVector")
tint.setValue(vec([0.106, 0.043, 0.047, 0.0]), forKey: "inputBiasVector")
guard let inked = tint.outputImage else { die("no tint") }

let per = max(1, px / (mods + 2 * quiet))          // whole modules, never a half-pixel edge
let side = (mods + 2 * quiet) * per

guard let ctx = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
                          space: CGColorSpaceCreateDeviceRGB(),
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { die("no context") }
ctx.interpolationQuality = .none
ctx.setFillColor(CGColor(red: cream.r, green: cream.g, blue: cream.b, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))

let ci = CIContext()
guard let cg = ci.createCGImage(inked, from: inked.extent) else { die("no bitmap") }
ctx.draw(cg, in: CGRect(x: quiet * per, y: quiet * per, width: mods * per, height: mods * per))

// Clear the centre to the same cream the code sits on, then stamp the badge into it.
let box = CGFloat(side) * CGFloat(frac)
let inset = box * 0.055
let cx = CGFloat(side) / 2.0
let r = box / 2.0
let hole = CGRect(x: cx - r, y: cx - r, width: box, height: box)
ctx.saveGState()
ctx.setFillColor(CGColor(red: cream.r, green: cream.g, blue: cream.b, alpha: 1))
ctx.addPath(CGPath(roundedRect: hole, cornerWidth: r, cornerHeight: r, transform: nil))
ctx.fillPath()
ctx.restoreGState()

guard let logoSrc = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[3]) as CFURL, nil),
      let badge = CGImageSourceCreateImageAtIndex(logoSrc, 0, nil) else { die("no logo") }
let d = badge.width >= badge.height ? CGFloat(badge.width) / CGFloat(box - 2 * inset)
                                   : CGFloat(badge.height) / CGFloat(box - 2 * inset)
let w = CGFloat(badge.width) / d
let h = CGFloat(badge.height) / d
// CoreImage draws from the bottom left, so the badge's top edge is hole.maxY - inset.
ctx.interpolationQuality = .high
ctx.draw(badge, in: CGRect(x: cx - w / 2, y: hole.maxY - inset - h, width: w, height: h))

ctx.interpolationQuality = .none
guard let out = ctx.makeImage() else { die("no output image") }
let url = URL(fileURLWithPath: a[2])
guard let dst = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else { die("no destination") }
CGImageDestinationAddImage(dst, out, nil)
if !CGImageDestinationFinalize(dst) { die("finalize failed") }

guard let back = CIImage(contentsOf: url) else { die("no readback file") }
let det = CIDetector(ofType: CIDetectorTypeQRCode, context: ci, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])
let ciMsgs = (det?.features(in: back) ?? []).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
let bytes = (try? Data(contentsOf: url).count) ?? -1

// Vision is the decoder Safari and a phone camera effectively are, and it tolerates a
// centre badge far better than CIDetector, so it is the gate that has to pass.
guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
      let probe = CGImageSourceCreateImageAtIndex(src, 0, nil) else { die("no probe bitmap") }
let req = VNDetectBarcodesRequest()
req.symbologies = [.qr]
try? VNImageRequestHandler(cgImage: probe, options: [:]).perform([req])
let vnMsgs = (req.results as? [VNBarcodeObservation]) ?? []
print("file=\(a[2]) side=\(side) mods=\(mods) per=\(per) badge_frac=\(frac) bytes=\(bytes)")
print("vision=\(vnMsgs.count) coreimage=\(ciMsgs)")
let ok = vnMsgs.contains { $0.payloadStringValue == a[1] }
print(ok ? "MATCH" : "MISMATCH")
if !ok { die("the shipped code does not read back") }
