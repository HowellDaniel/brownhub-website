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

// Goertzel over log-spaced bins: exact at the frequencies asked for and cheap enough to
// run over the whole clip rather than a lucky second.
let analysed = min(count, Int(20 * rate))
func energy(at hz: Double) -> Double {
  guard analysed > 1 else { return 0 }
  let coeff = 2.0 * cos(2.0 * Double.pi * hz / rate)
  var s1 = 0.0, s2 = 0.0
  for i in 0..<analysed {
    let s0 = Double(mono[i]) + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return (s1 * s1 + s2 * s2 - coeff * s1 * s2) / Double(analysed * analysed)
}
let bands: [Double] = [40, 60, 100, 150, 250, 400, 800, 1500, 3000, 6000, 12000]
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
