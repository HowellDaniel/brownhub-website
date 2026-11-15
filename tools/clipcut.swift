// Cut a phone-shot clip into a web copy, and pull one still out of it.
//
//   swiftc -O tools/clipcut.swift -o /tmp/clipcut
//   /tmp/clipcut probe  <src>
//   /tmp/clipcut encode <src> <dst.mp4> [tier] [bytes]
//   /tmp/clipcut poster <src> <dst.jpg> <width> [seconds|auto]
//
// tier is 540 or 720 or 1080 — the long side the encoder is allowed to reach; bytes is
// the whole-file ceiling, and Apple picks the bitrate that fits the clip inside it.
// A ceiling is the only honest way to ship a reel: the source durations here run 7s to
// 47s, so a fixed bitrate would bill a short clip and a long one at wildly different
// weights, and 1080p source that nobody asked for.
//
// The export session bakes the phone's own orientation into the pixels (a 2160x3840
// portrait MOV with a 90deg transform comes out 540x960, not a sideways slab), writes
// the moov atom at the front so the browser can start a clip before it has all of it,
// and keeps the audio — the noise a press makes is part of a print sample.
//
// `probe` prints what a batch plan needs to know before spending minutes encoding:
// duration, coded size, the size after the preferred transform, and the source bytes.
import AVFoundation
import ImageIO

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data(("clipcut: " + message + "\n").utf8))
  exit(1)
}

func asset(_ path: String) -> AVURLAsset {
  let url = URL(fileURLWithPath: path)
  guard FileManager.default.fileExists(atPath: url.path) else { fail("no such file: \(path)") }
  return AVURLAsset(url: url)
}

// The box the picture actually paints in, after the phone's rotation is applied.
func painted(_ item: AVAssetTrack) -> CGSize {
  let t = item.preferredTransform
  let s = item.naturalSize
  return t.a == 0 && t.d == 0 ? CGSize(width: abs(s.height), height: abs(s.width)) : s
}

// A cover's mean brightness, measured off a 32x32 sample. Phone clips open on a fade from
// black, so a poster cut at a fixed offset can be a pure black tile on the shelf; this is
// how the batch picks a frame that actually shows the print, and how it refuses one that
// never does.
func luma(_ image: CGImage) -> Double {
  let side = 32
  let space = CGColorSpace(name: CGColorSpace.sRGB)!
  guard let ctx = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8,
                            bytesPerRow: side * 4, space: space,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
    fail("could not sample a frame")
  }
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
  guard let bytes = ctx.data else { fail("could not read a sampled frame") }
  let px = bytes.bindMemory(to: UInt8.self, capacity: side * side * 4)
  var total = 0.0
  for i in 0..<(side * side) {
    let o = i * 4
    total += 0.299 * Double(px[o]) + 0.587 * Double(px[o + 1]) + 0.114 * Double(px[o + 2])
  }
  return total / Double(side * side)
}

func scaled(_ image: CGImage, to width: Int) -> CGImage {
  guard image.width != width else { return image }
  let height = max(1, Int(Double(image.height) * Double(width) / Double(image.width)))
  let space = CGColorSpace(name: CGColorSpace.sRGB)!
  guard let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                             bytesPerRow: width * 4, space: space,
                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return image }
  ctx.interpolationQuality = .high
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
  return ctx.makeImage() ?? image
}

func writeJPEG(_ image: CGImage, _ path: String) -> Int {
  let url = URL(fileURLWithPath: path)
  guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.jpeg" as CFString, 1, nil) else {
    fail("could not open a JPEG writer at \(path)")
  }
  CGImageDestinationAddImage(dest, image,
                             [kCGImageDestinationLossyCompressionQuality: 0.72] as CFDictionary)
  guard CGImageDestinationFinalize(dest) else { fail("could not write \(path)") }
  return (try? FileManager.default.attributesOfItem(atPath: path)[.size] as? Int) ?? 0
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail("usage: probe|encode|poster …") }
let mode = args[1]
let src = args[2]
let item = asset(src)

if mode == "probe" {
  let seconds = CMTimeGetSeconds(item.duration)
  guard let track = item.tracks(withMediaType: .video).first else { fail("no video track") }
  let coded = track.naturalSize
  let shown = painted(track)
  let bytes = (try? FileManager.default.attributesOfItem(atPath: src)[.size] as? Int) ?? 0
  // The track reports its sample description; HEVC source at 4K is the expensive
  // case, and the batch plan needs to know which clips are that.
  let hevc = item.tracks(withMediaType: .video).contains { track in
    track.formatDescriptions.contains { CMFormatDescriptionGetMediaSubType($0 as! CMFormatDescription) == kCMVideoCodecType_HEVC }
  }
  print("dur=\(String(format: "%.1f", seconds)) coded=\(Int(coded.width))x\(Int(coded.height)) "
    + "painted=\(Int(shown.width))x\(Int(shown.height)) mb=\(Int(bytes) / 1_048_576) "
    + "codec=\(hevc ? "hevc" : "h264") "
    + "audio=\(item.tracks(withMediaType: .audio).isEmpty ? "none" : "yes")")
  exit(0)
}

if mode == "encode" {
  guard args.count >= 4 else { fail("encode needs a destination") }
  let dst = args[3]
  let tier = args.count > 4 ? args[4] : "540"
  let limit = args.count > 5 ? Int64(args[5]) ?? 0 : 0
  let preset: String
  switch tier {
  case "540": preset = AVAssetExportPreset960x540
  case "720": preset = AVAssetExportPreset1280x720
  case "1080": preset = AVAssetExportPreset1920x1080
  default: fail("tier must be 540, 720 or 1080")
  }
  guard let session = AVAssetExportSession(asset: item, presetName: preset) else {
    fail("this machine cannot export \(src) at \(tier)")
  }
  session.outputURL = URL(fileURLWithPath: dst)
  session.outputFileType = .mp4
  session.shouldOptimizeForNetworkUse = true
  if limit > 0 { session.fileLengthLimit = limit }
  let semaphore = DispatchSemaphore(value: 0)
  session.exportAsynchronously { semaphore.signal() }
  semaphore.wait()
  if let error = session.error { fail("export failed: \(error.localizedDescription)") }
  guard session.status == .completed else { fail("export ended incomplete") }
  let size = (try? FileManager.default.attributesOfItem(atPath: dst)[.size] as? Int) ?? 0
  print("wrote \(dst) \(Int(size) / 1024)KB")
  exit(0)
}

if mode == "poster" {
  guard args.count >= 5 else { fail("poster needs a destination and a width") }
  let dst = args[3]
  let width = Int(args[4]) ?? 0
  guard width > 0 else { fail("width must be a number") }
  let wanted = args.count > 5 ? args[5] : "auto"
  let seconds = CMTimeGetSeconds(item.duration)
  guard let track = item.tracks(withMediaType: .video).first else { fail("no video track") }
  let generator = AVAssetImageGenerator(asset: item)
  generator.appliesPreferredTrackTransform = true
  generator.maximumSize = CGSize(width: CGFloat(width) * 2, height: CGFloat(width) * 4)
  generator.requestedTimeToleranceBefore = CMTime(seconds: 0.4, preferredTimescale: 600)
  generator.requestedTimeToleranceAfter = CMTime(seconds: 0.4, preferredTimescale: 600)

  func frame(_ at: Double) -> CGImage? {
    var actual = CMTime.zero
    let time = CMTime(seconds: min(max(at, 0.05), max(seconds - 0.1, 0.1)), preferredTimescale: 600)
    return try? generator.copyCGImage(at: time, actualTime: &actual)
  }

  // "auto" walks nine points across the clip and keeps the brightest, so a cover is the
  // print in the light rather than the black the camera started on.
  var picked: (image: CGImage, at: Double, luma: Double)?
  var marks: [Double]
  if wanted == "auto" {
    marks = (1...9).map { seconds * Double($0) / 10.0 }
  } else {
    guard let at = Double(wanted) else { fail("time must be a number or 'auto'") }
    marks = [at]
  }
  for at in marks {
    guard let image = frame(at) else { continue }
    let brightness = luma(image)
    if picked == nil || brightness > picked!.luma { picked = (image, at, brightness) }
  }
  guard let best = picked else { fail("no frame could be read from \(src)") }
  guard best.luma > 24 else {
    fail("every frame of \(src) is near-black (brightest luma \(Int(best.luma))) — no usable cover")
  }
  let bytes = writeJPEG(scaled(best.image, to: width), dst)
  let shown = painted(track)
  print("wrote \(dst) \(width)x\(Int(Double(width) * Double(best.image.height) / Double(best.image.width))) "
    + "at \(String(format: "%.1f", best.at)) luma=\(Int(best.luma)) "
    + "from \(Int(shown.width))x\(Int(shown.height)) \(bytes / 1024)KB")
  exit(0)
}

fail("unknown mode \(mode)")
