// Crop a clip to its print, and give it a sound that is the press instead of the shop.
//
//   swiftc -O tools/clipfit.swift -o /tmp/clipfit
//   /tmp/clipfit probe <file.mp4|file.wav>
//   /tmp/clipfit bed <out.wav> <seconds>
//   /tmp/clipfit cut <src.mp4> <dst.mp4> <x> <y> <w> <h> <bed|keep> [bytes] [from=<s>] [to=<s>]
//
// Two asks, one pass. The owner wants a print sample to show the print and not the wall
// behind it, and he wants the clips that carry their own recording to stop carrying it and
// take a cool sound instead — something like the first clip in the catalog, which is a low
// machine drone. A crop needs the pixels re-encoded, and a re-encode can carry any audio
// track, so the two land together and no clip is ever transcoded twice.
//
// The crop is a row copy, not a scale. A clip already sits at the size the stage paints, so
// sliding a window across its own pixels keeps every pixel the camera made and throws away
// only the rows and columns the numbers say are not the sample. Nothing gets interpolated,
// so nothing gets soft, and the byte budget is spent on fewer pixels rather than smeared
// over more of them.
//
// The bed is synthesised rather than lifted from another clip. Taking clip 1-1's own audio
// and pasting it onto the others would keep the shop in the file — and 1-1 is the reference
// the owner pointed at, so its own sound stays. A synth fits any length, so a 7-second clip
// and a 47-second one both end with the same fade instead of cutting a loop mid-breath.
import AVFoundation
import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data(("clipfit: " + message + "\n").utf8))
  exit(1)
}

func dbfs(_ v: Double) -> Double { v <= 0 ? -120 : 20 * log10(v) }

let RATE = 44100.0

// The bed, in the shape the reference clip's own numbers describe: energy down at 60 Hz, a
// wide spread of level rather than a flat hum, and both channels almost the same machine.
enum PressBed {
  // A press is not one tone. The frame slides, the rollers turn, and the paper goes: a thump
  // at 1.9 Hz, a swell over twenty seconds, and a hiss that never settles.
  //
  // The reference clip is not merely bassy — 400 Hz sits 45 dB under its own peak and 1500 Hz
  // 51 under, with one narrow whine near 800 the only thing alive in between. One pole cannot
  // carve that, so the bass noise goes through three poles at 105 Hz and the air starts above
  // the valley at 2600. Between them nothing is generated at all; the whine is an oscillator.
  //
  // What the bed does NOT copy is the reference's 74 dB of level spread, which is the shop
  // going quiet between jobs. A bed that drops to silence reads as a fault, not as a machine.
  static func samples(_ seconds: Double) -> (left: [Float], right: [Float]) {
    let count = max(1, Int(seconds * RATE))
    var left = [Float](repeating: 0, count: count)
    var right = [Float](repeating: 0, count: count)
    var seed: UInt64 = 0x9E37_79B9_7F4A_7C15
    func noise() -> Double {
      seed ^= seed << 13
      seed ^= seed >> 7
      seed ^= seed << 17
      return Double(seed & 0xFFFFFF) / Double(0xFFFFFF) * 2 - 1
    }
    let lp = 1.0 - exp(-2.0 * Double.pi * 120.0 / RATE)
    let hx = 1.0 - exp(-2.0 * Double.pi * 2600.0 / RATE)
    let lxa = 1.0 - exp(-2.0 * Double.pi * 5200.0 / RATE)
    // Each channel runs its own filters on its own noise, so the bed has a little width,
    // while the same oscillators underneath keep it one machine rather than two.
    var rumble = [[Double]](repeating: [0, 0, 0, 0], count: 2)
    var air = [[Double]](repeating: [0, 0, 0, 0, 0, 0, 0], count: 2)
    func shape(_ channel: Int, _ x: Double) -> (Double, Double) {
      var r = rumble[channel], a = air[channel]
      r[0] = x
      r[1] += lp * (r[0] - r[1])
      r[2] += lp * (r[1] - r[2])
      r[3] += lp * (r[2] - r[3])
      a[0] += hx * (x - a[0]); a[1] = x - a[0]
      a[2] += hx * (a[1] - a[2]); a[3] = a[1] - a[2]
      a[4] += hx * (a[3] - a[4]); a[5] = a[3] - a[4]
      a[6] += lxa * (a[5] - a[6])
      rumble[channel] = r; air[channel] = a
      return (r[3], a[6])
    }
    // No tone between 300 Hz and 2 kHz on purpose. The shop recordings are loud exactly there
    // because that is where a voice is, and the reference clip's one whine near 800 Hz is its
    // own motor, not a press in general; a synthesised copy of it would be a beep.
    let hums: [(hz: Double, amp: Double, drift: Double)] = [
      (41.0, 0.30, 0.05), (58.0, 0.52, 0.11), (61.5, 0.38, 0.07), (87.0, 0.26, 0.13),
      (116.0, 0.26, 0.05), (174.0, 0.16, 0.09), (232.0, 0.11, 0.03), (290.0, 0.06, 0.02),
    ]
    var phase = hums.map { _ in 0.0 }
    var thumpPhase = 0.0
    for i in 0..<count {
      let t = Double(i) / RATE
      let swell = 1.0 + 0.22 * sin(2.0 * Double.pi * 0.085 * t) + 0.09 * sin(2.0 * Double.pi * 0.021 * t + 2.1)
      let breathe = 1.0 + 0.09 * sin(2.0 * Double.pi * 0.31 * t + 1.2)
      thumpPhase += 1.9 / RATE
      if thumpPhase >= 1.0 { thumpPhase -= 1.0 }
      // The press cycle hits and then decays, which is what gives a drone a pulse to follow.
      let thump = exp(-thumpPhase * 6.5)
      var body = 0.0
      for (index, hum) in hums.enumerated() {
        phase[index] += 2.0 * Double.pi * hum.hz / RATE
        body += hum.amp * sin(phase[index] + hum.drift * sin(2.0 * Double.pi * 0.8 * t))
      }
      body *= swell * breathe * (1.0 + 0.42 * thump)
      // Between passes the level drops: a bed that never goes quiet is the one a visitor
      // talks over rather than hears.
      let quiet = 0.45 + 0.55 * thump
      let low = body * 0.32 * quiet
      let (rumbleL, hissL) = shape(0, noise())
      let (rumbleR, hissR) = shape(1, noise())
      left[i] = Float(low + rumbleL * 0.85 + hissL * 0.19)
      right[i] = Float(low + rumbleR * 0.85 + hissR * 0.19)
    }
    // Loud enough to hear under a room, quiet enough to leave the visitor's own volume alone.
    var total = 0.0
    for i in 0..<count { total += Double(left[i] * left[i] + right[i] * right[i]) / 2.0 }
    let found = (total / Double(count)).squareRoot()
    let gain = found > 0 ? pow(10.0, -22.9 / 20.0) / found : 1.0
    // Drive the limiter no harder than the signal needs: tanh is a nonlinear device, and every
    // extra dB of drive splatters odd harmonics of 58 Hz straight into the 400 Hz valley.
    for i in 0..<count {
      left[i] = Float(tanh(Double(left[i]) * gain * 1.05) / 1.05)
      right[i] = Float(tanh(Double(right[i]) * gain * 1.05) / 1.05)
    }
    let inLen = min(count, Int(0.05 * RATE)), outLen = min(count / 2, Int(0.30 * RATE))
    for i in 0..<count {
      var f = 1.0
      if i < inLen { let x = Double(i) / Double(inLen); f = x * x * (3 - 2 * x) }
      if i > count - outLen {
        let x = Double(count - i) / Double(outLen)
        f = min(f, x * x * (3 - 2 * x))
      }
      left[i] *= Float(f)
      right[i] *= Float(f)
    }
    return (left, right)
  }
}

func writeWav(_ path: String, _ channels: (left: [Float], right: [Float])) {
  let frames = channels.left.count
  var data = Data()
  func u32(_ v: Int) -> [UInt8] {
    [UInt8(v & 255), UInt8((v >> 8) & 255), UInt8((v >> 16) & 255), UInt8((v >> 24) & 255)]
  }
  func u16(_ v: Int) -> [UInt8] { [UInt8(v & 255), UInt8((v >> 8) & 255)] }
  let bytes = frames * 4
  data.append(contentsOf: Array("RIFF".utf8))
  data.append(contentsOf: u32(36 + bytes))
  data.append(contentsOf: Array("WAVE".utf8))
  data.append(contentsOf: Array("fmt ".utf8))
  data.append(contentsOf: u32(16))
  data.append(contentsOf: u16(1))
  data.append(contentsOf: u16(2))
  data.append(contentsOf: u32(Int(RATE)))
  data.append(contentsOf: u32(Int(RATE) * 4))
  data.append(contentsOf: u16(4))
  data.append(contentsOf: u16(16))
  data.append(contentsOf: Array("data".utf8))
  data.append(contentsOf: u32(bytes))
  var pcm = Data()
  pcm.reserveCapacity(bytes)
  for i in 0..<frames {
    let l = Int16(max(-32768, min(32767, lround(Double(channels.left[i]) * 32767))))
    let r = Int16(max(-32768, min(32767, lround(Double(channels.right[i]) * 32767))))
    pcm.append(contentsOf: u16(Int(l) & 0xffff))
    pcm.append(contentsOf: u16(Int(r) & 0xffff))
  }
  data.append(pcm)
  do { try data.write(to: URL(fileURLWithPath: path)) } catch { fail("cannot write \(path)") }
}

// PCM comes out of AVAssetReader in one interleaved block per sample buffer, which is read
// by copying the block rather than by touching an AudioBufferList — the list path answers
// -12737 on every buffer of these files and says nothing about why.
func pcmSettings() -> [String: Any] {
  [AVFormatIDKey: kAudioFormatLinearPCM,
   AVSampleRateKey: RATE,
   AVNumberOfChannelsKey: 2,
   AVLinearPCMBitDepthKey: 16,
   AVLinearPCMIsFloatKey: false,
   AVLinearPCMIsBigEndianKey: false,
   AVLinearPCMIsNonInterleaved: false]
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail("usage: probe|bed|cut …") }
let mode = args[1]

if mode == "bed" {
  guard args.count >= 4, let seconds = Double(args[3]) else { fail("bed needs <out.wav> <seconds>") }
  writeWav(args[2], PressBed.samples(seconds))
  let size = (try? FileManager.default.attributesOfItem(atPath: args[2])[.size] as? Int) ?? 0
  print("wrote \(args[2]) \(String(format: "%.1f", seconds))s \(size / 1024)KB")
  exit(0)
}

if mode == "probe" {
  let src = args[2]
  guard FileManager.default.fileExists(atPath: src) else { fail("no such file: \(src)") }
  let asset = AVURLAsset(url: URL(fileURLWithPath: src))
  guard let track = asset.tracks(withMediaType: .audio).first else { fail("no audio track") }
  let reader: AVAssetReader
  let output: AVAssetReaderTrackOutput
  do {
    reader = try AVAssetReader(asset: asset)
  } catch { fail("cannot read \(src): \(error.localizedDescription)") }
  output = AVAssetReaderTrackOutput(track: track, outputSettings: pcmSettings())
  reader.add(output)
  guard reader.startReading() else { fail("reader refused to start") }
  let described = track.formatDescriptions.first! as! CMFormatDescription
  let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(described)!
  let fileRate = Double(asbd.pointee.mSampleRate)
  var peak = 0.0, total = 0.0, count = 0, clipped = 0
  // A phone loudspeaker stops somewhere near 250 Hz, so the useful question about a bed is not
  // how loud it is but how much of it survives above that. One pole down and its complement up.
  let k250 = 1.0 - exp(-2.0 * Double.pi * 250.0 / fileRate)
  var lp = 0.0, sumLow = 0.0, sumHigh = 0.0
  while reader.status == .reading {
    guard let buffer = output.copyNextSampleBuffer(),
          let block = CMSampleBufferGetDataBuffer(buffer) else { break }
    let length = CMBlockBufferGetDataLength(block)
    guard length > 0 else { continue }
    var bytes = [UInt8](repeating: 0, count: length)
    guard CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length,
                                     destination: &bytes) == noErr else { continue }
    bytes.withUnsafeBytes { raw in
      let pcm = raw.bindMemory(to: Int16.self)
      let frames = length / 4
      for f in 0..<frames {
        let m = (Double(pcm[f * 2]) + Double(pcm[f * 2 + 1])) / 2.0 / 32768.0
        peak = max(peak, abs(m))
        total += m * m
        count += 1
        if abs(m) >= 0.999 { clipped += 1 }
        lp += k250 * (m - lp)
        sumLow += lp * lp
        sumHigh += (m - lp) * (m - lp)
      }
    }
  }
  guard count > 0 else { fail("no audio samples could be read") }
  let rms = (total / Double(count)).squareRoot()
  print("dur=\(String(format: "%.1f", CMTimeGetSeconds(asset.duration))) "
    + "rate=\(Int(asbd.pointee.mSampleRate)) ch=\(Int(asbd.pointee.mChannelsPerFrame)) "
    + "rms=\(String(format: "%.1f", dbfs(rms))) peak=\(String(format: "%.1f", dbfs(peak))) "
    + "below250=\(String(format: "%.1f", dbfs((sumLow / Double(count)).squareRoot()))) "
    + "pocket=\(String(format: "%.1f", dbfs((sumHigh / Double(count)).squareRoot()))) "
    + "clipped=\(clipped)")
  exit(0)
}

guard mode == "cut" else { fail("unknown mode \(mode)") }
guard args.count >= 8 else { fail("cut needs <src> <dst> <x> <y> <w> <h> <bed|keep> [bytes] [from=<s>] [to=<s>]") }
let src = args[2]
let dst = args[3]
let cropX = Int(args[4])!, cropY = Int(args[5])!
let outW = Int(args[6])!, outH = Int(args[7])!
let sound = args[8]
let budget = args.count > 9 ? (Int64(args[9]) ?? 0) : 0
guard sound == "bed" || sound == "keep" else { fail("sound must be bed or keep") }
guard outW >= 16, outH >= 16 else { fail("a crop smaller than 16x16 is not a picture") }

// A crop can only move a rectangle inside the frame; it cannot make a shot that spends half
// its length on a person and half on the press show only the press. Where the print is only
// in the frame for part of the clip, the rest of the clip is cut off the end: from/to are
// seconds of the source, and the bed is written for the trimmed length so sound and picture
// still stop together.
var cutFrom = 0.0, cutTo = 0.0
for extra in args.dropFirst(10) {
  let kv = extra.split(separator: "=", maxSplits: 1).map(String.init)
  guard kv.count == 2, let v = Double(kv[1]) else { fail("unknown cut argument \(extra)") }
  if kv[0] == "from" { cutFrom = v } else if kv[0] == "to" { cutTo = v }
  else { fail("unknown cut argument \(extra)") }
}

let asset = AVURLAsset(url: URL(fileURLWithPath: src))
guard FileManager.default.fileExists(atPath: src) else { fail("no such file: \(src)") }
let seconds = CMTimeGetSeconds(asset.duration)
guard seconds > 0.2 else { fail("clip has no readable length") }
if cutTo == 0 { cutTo = seconds }
guard cutFrom >= 0, cutFrom < cutTo, cutTo <= seconds + 0.05 else {
  fail("trim \(cutFrom)–\(cutTo) is not a window inside 0–\(seconds)")
}
// A plan written by hand names whole tenths, and a clip's real length is a nominal duration
// rounded from frames. Pull the window back to the picture that exists rather than asking the
// compositor for a quarter-frame the source never had.
if cutTo > seconds { cutTo = seconds }
let keep = cutTo - cutFrom
guard let videoTrack = asset.tracks(withMediaType: .video).first else { fail("no video track") }

// Bed mode reads its audio out of a generated wav through the same code that reads a clip's
// own track, so one decode path serves both and the file on disk is also the file you can
// listen to on its own.
let bedPath = dst + ".bed.wav"
switch sound {
case "bed": writeWav(bedPath, PressBed.samples(keep))
case "keep": break
default: break
}
let audioAsset = sound == "bed" ? AVURLAsset(url: URL(fileURLWithPath: bedPath)) : asset
let audioTrack = audioAsset.tracks(withMediaType: .audio).first
if sound == "keep" {
  guard asset.tracks(withMediaType: .audio).first != nil else { fail("keep asked for but \(src) has no audio track") }
}

// AVAssetWriter takes width, height and codec from its settings on this machine and quietly
// drops the whole compression-properties dictionary: a crop told to hit 320 kbps came out at
// 4.1 Mbps, three times the clip it was replacing. AVAssetExportSession is the API that does
// obey a byte ceiling, and it is what made every clip already on the site, so the crop is
// described to the compositor rather than punched out of pixels by hand.
guard videoTrack.preferredTransform.isIdentity else {
  fail("\(src) is not baked upright; a top-down crop would land on the wrong edge")
}
let wide = Int(videoTrack.naturalSize.width), tall = Int(videoTrack.naturalSize.height)
guard cropX >= 0, cropY >= 0, cropX + outW <= wide, cropY + outH <= tall else {
  fail("crop \(cropX)+\(outW)x\(cropY)+\(outH) does not fit a \(wide)x\(tall) frame")
}

// The window the reader keeps, measured in the source, and the same window measured on the
// stage it is placed at zero onto. Without a trim they are the same span, and the composition
// is just the clip.
let scale = CMTimeScale(600)
let span = CMTimeRange(start: CMTime(seconds: cutFrom, preferredTimescale: scale),
                       duration: CMTime(seconds: keep, preferredTimescale: scale))
let onStage = CMTimeRange(start: .zero, duration: span.duration)
let composition = AVMutableComposition()
guard let layerTrack = composition.addMutableTrack(withMediaType: .video,
                                                   preferredTrackID: kCMPersistentTrackID_Invalid)
else { fail("this machine cannot build a video track") }
do { try layerTrack.insertTimeRange(span, of: videoTrack, at: .zero) }
catch { fail("cannot place the video of \(src) in a composition: \(error.localizedDescription)") }

guard let soundTrack = audioTrack,
      let audioCarry = composition.addMutableTrack(withMediaType: .audio,
                                                   preferredTrackID: kCMPersistentTrackID_Invalid)
else { fail("\(src) has no sound to carry") }
// A generated bed is already written at the trimmed length, so all of it goes in; a clip's own
// sound is the full recording and has to be cut to the same window the picture was cut to.
do { try audioCarry.insertTimeRange(sound == "bed" ? soundTrack.timeRange : span,
                                    of: soundTrack, at: .zero) }
catch { fail("cannot place the sound of \(src) in a composition: \(error.localizedDescription)") }

let film = AVMutableVideoComposition()
film.renderSize = CGSize(width: outW, height: outH)
let fps = videoTrack.nominalFrameRate
film.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps > 1 ? fps.rounded() : 30))
let window = AVMutableVideoCompositionLayerInstruction(assetTrack: layerTrack)
// The compositor measures y from the bottom of the frame while the plan measures the crop from
// the top, so the window is lifted by whatever the source has below it.
window.setTransform(CGAffineTransform(translationX: CGFloat(-cropX),
                                      y: CGFloat(cropY + outH - tall)), at: .zero)
let beat = AVMutableVideoCompositionInstruction()
beat.timeRange = onStage
beat.layerInstructions = [window]
film.instructions = [beat]

// A half-written file at the destination makes the exporter answer "Cannot Save", which reads
// like a broken crop rather than the leftovers of the run that just failed.
try? FileManager.default.removeItem(atPath: dst)
// The sized presets (960x540, 1280x720, 1920x1080) also rescale whatever they are given, and a
// 526x720 crop would leave one of them as a blown-up or shrunk picture. HighestQuality asks for
// no box at all, so the compositor's renderSize is the file's frame size and the crop is delivered
// at the pixels the plan chose.
guard let session = AVAssetExportSession(asset: composition,
                                         presetName: AVAssetExportPresetHighestQuality) else {
  fail("this machine cannot export a cropped clip")
}
session.outputURL = URL(fileURLWithPath: dst)
session.outputFileType = .mp4
session.videoComposition = film
session.shouldOptimizeForNetworkUse = true
// Never heavier than the clip it replaces: the ceiling is the file already shipped, so a crop
// buys back the pixels it threw away as a smaller download instead of a bigger one.
if budget > 0 { session.fileLengthLimit = budget }
let gate = DispatchSemaphore(value: 0)
session.exportAsynchronously { gate.signal() }
gate.wait()
if let error = session.error { fail("export failed: \(error.localizedDescription)") }
guard session.status == .completed else { fail("export ended at status \(session.status.rawValue)") }
try? FileManager.default.removeItem(atPath: bedPath)
let size = (try? FileManager.default.attributesOfItem(atPath: dst)[.size] as? Int) ?? 0
print("cut \(src) → \(dst) \(outW)x\(outH) from \(wide)x\(tall) at \(cropX),\(cropY) "
  + "t=\(String(format: "%.1f", cutFrom))–\(String(format: "%.1f", cutTo)) "
  + "fps=\(film.frameDuration.timescale) sound=\(sound) \(size / 1024)KB of \(budget / 1024)KB")
exit(0)
