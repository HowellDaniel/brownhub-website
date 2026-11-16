// What is actually on a clip's sound track?
//
//   swiftc -O tools/soundprobe.swift -o /tmp/soundprobe
//   /tmp/soundprobe probe <src.mp4> [out.wav]
//   /tmp/soundprobe bed   <src.mp4> <out.wav> [seconds]
//
// The catalog asks for the clips' own recorded sound to be swapped for a different,
// cool one modelled on the first clip, and nobody can design a replacement until the
// reference is measured: whether it is press ambience, handheld chatter, mains hum or
// music decides whether it is usable as a bed at all. `probe` decodes the whole track to
// 44.1k stereo PCM and prints level, modulation, spectral shape and hum lines; it can
// also drop the PCM to a WAV so another tool can read it.
//
// `bed` writes only the quietest clean stretch of a clip, trimmed and edge-faded, which
// is the least of a real recording that could embarrass the shop: the part where nobody
// is talking and nothing is being named.
import AVFoundation
import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data(("soundprobe: " + message + "\n").utf8))
  exit(1)
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail("usage: probe|bed <src> [out.wav] [seconds]") }
let mode = args[1]
let src = args[2]
let wavPath = args.count > 3 ? args[3] : ""
let wantSeconds = args.count > 4 ? (Double(args[4]) ?? 6.0) : 6.0
let url = URL(fileURLWithPath: src)
guard FileManager.default.fileExists(atPath: url.path) else { fail("no such file: \(src)") }

let asset = AVURLAsset(url: url)
guard let track = asset.tracks(withMediaType: .audio).first else {
  print("audio=none")
  exit(0)
}
let described = track.formatDescriptions.first as! CMFormatDescription
let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(described)!
let inRate = Int(asbd.pointee.mSampleRate)
let inChans = Int(asbd.pointee.mChannelsPerFrame)

let settings: [String: Any] = [
  AVFormatIDKey: kAudioFormatLinearPCM,
  AVSampleRateKey: 44100.0,
  AVNumberOfChannelsKey: 2,
  AVLinearPCMBitDepthKey: 16,
  AVLinearPCMIsFloatKey: false,
  AVLinearPCMIsBigEndianKey: false,
  AVLinearPCMIsNonInterleaved: false,
]
let pcmOutput: AVAssetReaderTrackOutput? = AVAssetReaderTrackOutput(track: track,
                                                                   outputSettings: settings)
guard let reader = try? AVAssetReader(asset: asset), let output = pcmOutput else {
  fail("cannot decode the audio of \(src)")
}
reader.add(output)
guard reader.startReading() else { fail("reader refused to start") }

var scratch = UnsafeMutableRawPointer.allocate(byteCount: 65536, alignment: 16)
var scratchBytes = 65536
defer { scratch.deallocate() }

var lefts: [Float] = []
var rights: [Float] = []
var clipped = 0
while reader.status == .reading {
  guard let buffer = output.copyNextSampleBuffer(),
        let block = CMSampleBufferGetDataBuffer(buffer) else { break }
  let length = CMBlockBufferGetDataLength(block)
  guard length > 0 else { continue }
  if length > scratchBytes {
    scratch.deallocate()
    scratchBytes = length
    scratch = UnsafeMutableRawPointer.allocate(byteCount: scratchBytes, alignment: 16)
  }
  guard CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length,
                                   destination: scratch) == noErr else { continue }
  let pcm = scratch.bindMemory(to: Int16.self, capacity: length / 2)
  let frames = length / 4  // two interleaved channels of int16
  for f in 0..<frames {
    let l = Float(pcm[f * 2]) / 32768.0
    let r = Float(pcm[f * 2 + 1]) / 32768.0
    if abs(l) >= 0.999 || abs(r) >= 0.999 { clipped += 1 }
    lefts.append(l)
    rights.append(r)
  }
}
if reader.status == .failed { fail("decode failed") }
guard !lefts.isEmpty else { fail("no audio samples could be read from \(src)") }

let rate = 44100.0
let count = lefts.count
let seconds = Double(count) / rate
let mono = (0..<count).map { (lefts[$0] + rights[$0]) / 2.0 }
func dbfs(_ v: Double) -> Double { v <= 0 ? -120.0 : 20 * log10(v) }

var peak = 0.0
var total = 0.0
for v in mono { peak = max(peak, Double(abs(v))); total += Double(v * v) }
let rms = (total / Double(count)).squareRoot()

// Ten frames a second: a machine hums steady, a person talking swells and stops, and a
// bed that never modulates is the one nobody notices.
let hop = Int(rate / 10)
var env: [Double] = []
var at = 0
while at + hop <= count {
  var sum = 0.0
  for i in at..<(at + hop) { sum += Double(mono[i] * mono[i]) }
  env.append((sum / Double(hop)).squareRoot())
  at += hop
}
let dbEnv = env.map { dbfs(Double($0)) }
let spread = (dbEnv.max() ?? -120) - (dbEnv.min() ?? -120)
let silentShare = dbEnv.isEmpty ? 0.0 : Double(dbEnv.filter { $0 < -45 }.count) / Double(dbEnv.count)

var crossings = 0
for i in 1..<count where mono[i - 1] * mono[i] < 0 { crossings += 1 }
let zcr = Double(crossings) / max(1, seconds) / 2.0

// Spectral shape, measured honestly. A Goertzel resonator is unusable here: at these
// frequencies its poles sit within 1e-4 of z=+1, so its state is ~1e8 and the recursion
// s0 = x + coeff*s1 - s2 cancels six significant digits away into rounding noise. The proof is
// a pure 58 Hz sine, which the resonator version reported as peaking at 150 Hz. This is a
// windowed heterodyne instead — multiply by e^-i2πft over a 2 s Hann window and average the
// block powers — so every sum stays bounded and 0.5 Hz of resolution keeps a 58 Hz tone out of
// the 40 Hz bin by about 90 dB.
let analysed = min(count, Int(20 * rate))
let win = Int(2 * rate)
var tables: [Int: (cosine: [Double], sine: [Double])] = [:]
func energy(at hz: Double) -> Double {
  guard analysed >= win, win > 1 else { return 0 }
  if tables[Int(hz * 1000)] == nil {
    var c = [Double](repeating: 0, count: win)
    var s = [Double](repeating: 0, count: win)
    for j in 0..<win {
      let w = 0.5 - 0.5 * cos(2.0 * Double.pi * Double(j) / Double(win - 1))
      let ang = 2.0 * Double.pi * hz * Double(j) / rate
      c[j] = w * cos(ang)
      s[j] = w * sin(ang)
    }
    tables[Int(hz * 1000)] = (c, s)
  }
  let (c, s) = tables[Int(hz * 1000)]!
  var windowPower = 0.0
  for j in 0..<win { windowPower += c[j] * c[j] + s[j] * s[j] }
  var total = 0.0
  var blocks = 0
  var start = 0
  while start + win <= analysed {
    var re = 0.0, im = 0.0
    for j in 0..<win {
      let x = Double(mono[start + j])
      re += x * c[j]
      im += x * s[j]
    }
    total += (re * re + im * im) / (windowPower * windowPower / 2.0)
    blocks += 1
    start += win
  }
  return blocks > 0 ? total / Double(blocks) : 0
}
let bands: [Double] = [40, 58, 100, 150, 250, 400, 800, 1500, 3000, 6000, 12000]
let raw = bands.map { energy(at: $0) }
let bandTotal = raw.reduce(0.0) { $0 + $1 }
let centroid = bandTotal > 0 ? zip(bands, raw).reduce(0.0) { $0 + $1.0 * $1.1 } / bandTotal : 0
var topIndex = 0
for i in 1..<raw.count where raw[i] > raw[topIndex] { topIndex = i }
let topDb = bandTotal > 0 ? 10 * log10(raw[topIndex] / bandTotal) : -120
let relative = raw.map { $0 > 0 && bandTotal > 0 ? 10 * log10($0 / bandTotal) : -40.0 }

// Mains hum is the tell of unfiltered shop equipment, and the one thing a replacement bed
// must not copy.
let humEnergy = [50.0, 60.0, 100.0, 120.0, 150.0, 180.0].reduce(0.0) { $0 + energy(at: $1) }
let humShare = bandTotal > 0 ? humEnergy / bandTotal : 0

// Rain is not a spectrum problem, it is a motion problem: a drone whose level pulses a couple
// of times a second, or whose nearby partials beat against each other, reads as water on a tin
// roof long before any band looks hissy. The 10 Hz frame rate above is far too slow to see a
// 3.5 Hz beat at all — that blind spot is exactly how a bed measured clean and still got called
// a roof. So the level is re-traced every 2 ms and interrogated at the rates the bed's own
// modulators and partial spacings imply; each answer is how many dB the level swings there.
let fhop = max(1, Int(rate / 500))
var fenv: [Double] = []
var fat = 0
while fat + fhop <= count {
  var sum = 0.0
  for i in fat..<(fat + fhop) { sum += Double(mono[i] * mono[i]) }
  fenv.append(dbfs((sum / Double(fhop)).squareRoot()))
  fat += fhop
}
let fRate = rate / Double(fhop)
let lfos: [Double] = [0.021, 0.085, 0.31, 1.9, 3.5, 17.0]
func swing(at hz: Double) -> Double {
  guard fenv.count > 32, hz < fRate / 2.5 else { return -120 }
  // A projection over a fraction of a cycle reads the fades as modulation, so the first and
  // last 0.4 s — where the bed is ramped in and out — are not asked about.
  let skip = min(fenv.count / 4, max(2, Int(0.4 * fRate)))
  let lo = skip, hi = fenv.count - skip
  var sum = 0.0
  for i in lo..<hi { sum += fenv[i] }
  let mean = sum / Double(hi - lo)
  var sc = 0.0, ss = 0.0
  for i in lo..<hi {
    let x = 2.0 * Double.pi * hz * Double(i - lo) / fRate
    sc += (fenv[i] - mean) * cos(x)
    ss += (fenv[i] - mean) * sin(x)
  }
  return 2.0 * (sc * sc + ss * ss).squareRoot() / Double(hi - lo)
}

var meanL = 0.0, meanR = 0.0
for i in 0..<count { meanL += Double(lefts[i]); meanR += Double(rights[i]) }
meanL /= Double(count); meanR /= Double(count)
var cov = 0.0, vl = 0.0, vr = 0.0
for i in 0..<count {
  let l = Double(lefts[i]) - meanL
  let r = Double(rights[i]) - meanR
  cov += l * r; vl += l * l; vr += r * r
}
let corr = (vl > 0 && vr > 0) ? cov / (vl.squareRoot() * vr.squareRoot()) : 0

func writeWav(_ path: String, from: [Float], to: [Float]) {
  let frames = from.count
  let dataBytes = frames * 4
  var data = Data()
  func u32(_ v: Int) -> [UInt8] {
    [UInt8(v & 255), UInt8((v >> 8) & 255), UInt8((v >> 16) & 255), UInt8((v >> 24) & 255)]
  }
  func u16(_ v: Int) -> [UInt8] { [UInt8(v & 255), UInt8((v >> 8) & 255)] }
  data.append(contentsOf: Array("RIFF".utf8))
  data.append(contentsOf: u32(36 + dataBytes))
  data.append(contentsOf: Array("WAVE".utf8))
  data.append(contentsOf: Array("fmt ".utf8))
  data.append(contentsOf: u32(16))
  data.append(contentsOf: u16(1))
  data.append(contentsOf: u16(2))
  data.append(contentsOf: u32(44100))
  data.append(contentsOf: u32(44100 * 4))
  data.append(contentsOf: u16(4))
  data.append(contentsOf: u16(16))
  data.append(contentsOf: Array("data".utf8))
  data.append(contentsOf: u32(dataBytes))
  for i in 0..<frames {
    let l = Int32(max(-32768, min(32767, lround(Double(from[i]) * 32767))))
    let r = Int32(max(-32768, min(32767, lround(Double(to[i]) * 32767))))
    data.append(contentsOf: u16(Int(l) & 0xffff))
    data.append(contentsOf: u16(Int(r) & 0xffff))
  }
  do { try data.write(to: URL(fileURLWithPath: path)) } catch { fail("cannot write \(path)") }
}

if mode == "bed" {
  guard !wavPath.isEmpty else { fail("bed needs an output wav") }
  let want = min(Int(wantSeconds * rate), count)
  guard env.count > 2, want >= hop else { fail("too short to pick a clean run") }
  var bestStart = 0
  var worst = Double.infinity
  var start = 0
  while start + want <= count {
    var highest = 0.0
    var i = start
    while i < start + want {
      let bucket = i / hop
      if bucket < env.count { highest = max(highest, env[bucket]) }
      i += hop
    }
    if highest < worst { worst = highest; bestStart = start }
    start += hop
  }
  var l = Array(lefts[bestStart..<(bestStart + want)])
  var r = Array(rights[bestStart..<(bestStart + want)])
  let fade = min(Int(0.1 * rate), want / 2)
  for i in 0..<fade {
    let g = Float(i) / Float(fade)
    l[i] *= g; r[i] *= g
    l[want - 1 - i] *= g; r[want - 1 - i] *= g
  }
  writeWav(wavPath, from: l, to: r)
  print("bed=\(wavPath) from \(String(format: "%.2f", Double(bestStart) / rate))s "
    + "len=\(String(format: "%.2f", Double(want) / rate))s peak=\(String(format: "%.1f", dbfs(worst)))dB")
  exit(0)
}

guard mode == "probe" else { fail("unknown mode \(mode)") }
if !wavPath.isEmpty { writeWav(wavPath, from: lefts, to: rights) }
let shape = zip(bands, relative).map { "\(Int($0.0)):\(String(format: "%+.0f", $0.1))" }.joined(separator: " ")
print("\(src.split(separator: "/").last ?? "?") "
  + "dur=\(String(format: "%.2f", seconds)) srcRate=\(inRate) srcCh=\(inChans) "
  + "peak=\(String(format: "%.1f", dbfs(peak))) rms=\(String(format: "%.1f", dbfs(Double(rms)))) "
  + "clip=\(clipped) spread=\(String(format: "%.1f", spread)) "
  + "silence=\(String(format: "%.0f", silentShare * 100))% zcr=\(String(format: "%.0f", zcr)) "
  + "centroid=\(String(format: "%.0f", centroid)) top=\(Int(bands[topIndex]))(\(String(format: "%.0f", topDb))dB) "
  + "hum=\(String(format: "%.1f", humShare * 100))% corr=\(String(format: "%.2f", corr))")
print("  bands \(shape)")
let amText = lfos.map { "\(String(format: "%g", $0)):\(String(format: "%+.1f", swing(at: $0)))dB" }
  .joined(separator: " ")
print("  am \(amText)")
