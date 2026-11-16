// Crop a clip to its print, and give it a sound that is the press instead of the shop.
//
//   swiftc -O tools/clipfit.swift -o /tmp/clipfit
//   /tmp/clipfit probe <file.mp4|file.wav>
//   /tmp/clipfit bed <out.wav> <seconds>
//   /tmp/clipfit cut <src.mp4> <dst.mp4> <x> <y> <w> <h> <bed|keep> [bytes] [from=<s>] [to=<s>]
//   /tmp/clipfit swap <src.mp4> <dst.mp4>
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

// A swap drains its two tracks on separate queues, so a failure can surface from either while
// the other is still appending. Both names get collected and printed together, because one
// track stalling is usually the other's fault and reporting only the first is misleading.
final class Trap {
  private let lock = NSLock()
  private var messages: [String] = []
  func add(_ message: String) {
    lock.lock(); messages.append(message); lock.unlock()
  }
  var all: [String] {
    lock.lock(); defer { lock.unlock() }
    return messages
  }
}

let RATE = 44100.0

// The bed, in the shape the reference clip's own numbers describe: energy down at 60 Hz and
// both channels the same machine.
enum PressBed {
  // The owner's word for the first bed was "the roof sounds": under the drone there was a
  // wash of generated noise — a three-pole bass rumble and an air band above 2600 Hz — and
  // measured on the shipped files it reads exactly like rain on a tin roof: 1348 zero
  // crossings a second with a floor that stays flat and roughly 38 dB down from 800 Hz all
  // the way to 12 kHz. That wash is gone. He then said the bed still sounded like rain, and
  // named "the low rumble left in the tone", and this time the numbers agreed with him in a
  // way the spectrum never did: rain is motion, not treble. Traced on a 2 ms envelope, the
  // tone that measured clean at zcr 65 was swinging +3.4 dB 3.5 times a second and +2.3 dB
  // seventeen times a second, because two of its partials sat 3.5 Hz apart (58 and 61.5) and
  // two sat 17 apart (41 and 58). Two nearby frequencies do not make one pitch, they make a
  // wobble, and a wobble on a low drone is water. So:
  //
  //   • every partial is now a whole multiple of 58 Hz, which is one machine at one pitch and
  //     cannot beat against itself. The 41 Hz sub — the literal "low rumble" he named, and
  //     below what a laptop or a phone reproduces at all — is out, and the 87 Hz fifth that
  //     made the series inharmonic is out with it.
  //   • the 0.8 Hz wobble that was added to each partial's phase is out. A press does not
  //     vibrato.
  //   • the press pulse stays at the real 1.9 Hz cycle but is no longer a spike that decays.
  //     The old shape was 1.42× against a floor of 0.45×, a 10 dB hit twice a second, which
  //     is the rhythm of drops landing; it is now a 3 dB rise and fall, which is the rhythm
  //     of a machine working.
  //
  // The slow swells are kept but flattened to well under a dB each, and the consequence of
  // taking out the sub is the good kind: what is left sits where a phone loudspeaker can
  // actually put sound, so the tone is more audible on the pocket than the rumble was.
  static func samples(_ seconds: Double) -> (left: [Float], right: [Float]) {
    let count = max(1, Int(seconds * RATE))
    var left = [Float](repeating: 0, count: count)
    var right = [Float](repeating: 0, count: count)
    // No tone between 300 Hz and 2 kHz on purpose. The shop recordings are loud exactly there
    // because that is where a voice is, and the reference clip's one whine near 800 Hz is its
    // own motor, not a press in general; a synthesised copy of it would be a beep.
    let hums: [(hz: Double, amp: Double)] = [
      (58.0, 0.62), (116.0, 0.34), (174.0, 0.22), (232.0, 0.14), (290.0, 0.08), (348.0, 0.05),
    ]
    var phase = hums.map { _ in 0.0 }
    var thumpPhase = 0.0
    for i in 0..<count {
      let t = Double(i) / RATE
      let swell = 1.0 + 0.05 * sin(2.0 * Double.pi * 0.085 * t) + 0.03 * sin(2.0 * Double.pi * 0.021 * t + 2.1)
      let breathe = 1.0 + 0.03 * sin(2.0 * Double.pi * 0.31 * t + 1.2)
      thumpPhase += 1.9 / RATE
      if thumpPhase >= 1.0 { thumpPhase -= 1.0 }
      let thump = 0.5 + 0.5 * cos(2.0 * Double.pi * thumpPhase)
      var body = 0.0
      for (index, hum) in hums.enumerated() {
        phase[index] += 2.0 * Double.pi * hum.hz / RATE
        body += hum.amp * sin(phase[index])
      }
      body *= swell * breathe * (1.0 + 0.20 * thump)
      left[i] = Float(body * 0.32 * (0.86 + 0.14 * thump))
      right[i] = left[i]
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
guard args.count >= 3 else { fail("usage: probe|bed|cut|swap …") }
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

if mode == "swap" {
  // Re-lay the bed over a clip without touching one pixel of its picture.
  //
  // The clips on the site are already the crops the plan chose, so running `cut` against one
  // of them would crop the crop. Only the sound is being replaced here, and a writer given no
  // output settings for its video input copies the compressed samples straight through — so
  // the frame the site proved on screen goes out byte for byte while the audio is re-issued.
  guard args.count >= 4 else { fail("swap needs <src.mp4> <dst.mp4>") }
  let from = args[2], into = args[3]
  guard FileManager.default.fileExists(atPath: from) else { fail("no such file: \(from)") }
  let film = AVURLAsset(url: URL(fileURLWithPath: from))
  guard let picture = film.tracks(withMediaType: .video).first else { fail("\(from) has no video track") }
  let length = CMTimeGetSeconds(film.duration)
  guard length > 0.2 else { fail("\(from) has no readable length") }

  let bedPath = into + ".bed.wav"
  writeWav(bedPath, PressBed.samples(length))
  let bed = AVURLAsset(url: URL(fileURLWithPath: bedPath))
  guard let sound = bed.tracks(withMediaType: .audio).first else { fail("the bed wrote no audio") }

  guard let reader = try? AVAssetReader(asset: film) else { fail("cannot read \(from)") }
  let pixels = AVAssetReaderTrackOutput(track: picture, outputSettings: nil)
  guard reader.canAdd(pixels) else { fail("this machine cannot pass the picture of \(from) through") }
  reader.add(pixels)
  guard let bedReader = try? AVAssetReader(asset: bed) else { fail("cannot read the generated bed") }
  let samples = AVAssetReaderTrackOutput(track: sound, outputSettings: pcmSettings())
  guard bedReader.canAdd(samples) else { fail("this machine cannot read the generated bed") }
  bedReader.add(samples)

  try? FileManager.default.removeItem(atPath: into)
  guard let writer = try? AVAssetWriter(outputURL: URL(fileURLWithPath: into), fileType: .mp4) else {
    fail("this machine cannot write \(into)")
  }
  // The site streams these files from GitHub Pages, so the index has to arrive before the
  // pixels — the same fast start every clip already on the origin was shipped with.
  writer.shouldOptimizeForNetworkUse = true
  // A nil outputSettings means passthrough, but for an MP4 rather than a QuickTime movie the
  // writer needs the source's own description up front before it will accept a compressed
  // buffer at all.
  let hint = picture.formatDescriptions.first as! CMFormatDescription
  let videoIn = AVAssetWriterInput(mediaType: .video, outputSettings: nil, sourceFormatHint: hint)
  videoIn.expectsMediaDataInRealTime = false
  let audioIn = AVAssetWriterInput(mediaType: .audio, outputSettings: [
    AVFormatIDKey: kAudioFormatMPEG4AAC,
    AVSampleRateKey: RATE,
    AVNumberOfChannelsKey: 2,
    AVEncoderBitRateKey: 128_000,
  ])
  audioIn.expectsMediaDataInRealTime = false
  guard writer.canAdd(videoIn), writer.canAdd(audioIn) else { fail("this machine refuses the swap inputs") }
  writer.add(videoIn); writer.add(audioIn)
  do { try writer.startWriting() } catch { fail("startWriting: \(error.localizedDescription)") }
  writer.startSession(atSourceTime: .zero)
  guard reader.startReading(), bedReader.startReading() else {
    fail("a reader refused to start: \(reader.error?.localizedDescription ?? bedReader.error?.localizedDescription ?? "?")")
  }
  // Passthrough is unforgiving about a timestamp it cannot place, and every failure in this
  // mode has to name which track caused it rather than print "Cannot Save".
  //
  // Both tracks are fed at the same time, and that is not a performance choice. A writer told
  // to lay its index out for streaming holds samples back until it can order them against the
  // other track, so pushing the whole picture out in front of the sound leaves it waiting for
  // audio that is only offered once the picture is finished — the two ends of one file deadlock
  // and no byte ever reaches disk.
  let trap = Trap()
  let drained = DispatchGroup()
  func drain(_ film_: AVAssetReader, _ out: AVAssetReaderTrackOutput,
             _ input: AVAssetWriterInput, _ who: String) {
    drained.enter()
    input.requestMediaDataWhenReady(on: DispatchQueue(label: "clipfit.swap." + who)) {
      while input.isReadyForMoreMediaData {
        if film_.status == .failed {
          trap.add("\(who) read: \(film_.error?.localizedDescription ?? "?")")
          input.markAsFinished(); drained.leave(); return
        }
        guard let buffer = out.copyNextSampleBuffer() else {
          if film_.status == .reading { trap.add("\(who) ran out of samples while still reading") }
          input.markAsFinished(); drained.leave(); return
        }
        if !input.append(buffer) {
          trap.add("\(who) write: \(writer.error?.localizedDescription ?? "?")")
          input.markAsFinished(); drained.leave(); return
        }
      }
    }
  }
  drain(reader, pixels, videoIn, "picture")
  drain(bedReader, samples, audioIn, "bed")
  let swapped = DispatchSemaphore(value: 0)
  drained.notify(queue: DispatchQueue.global()) { writer.finishWriting { swapped.signal() } }
  swapped.wait()
  if trap.all.count > 0 { fail(trap.all.joined(separator: "; ")) }
  if writer.status != .completed { fail("swap ended at status \(writer.status.rawValue): \(writer.error?.localizedDescription ?? "?")") }
  try? FileManager.default.removeItem(atPath: bedPath)
  let before = (try? FileManager.default.attributesOfItem(atPath: from)[.size] as? Int) ?? 0
  let after = (try? FileManager.default.attributesOfItem(atPath: into)[.size] as? Int) ?? 0
  print("swap \(from) → \(into) \(length)s \(after / 1024)KB was \(before / 1024)KB")
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
