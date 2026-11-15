// Where the print is, and what is not the print.
//
//   swiftc -O tools/clipeye.swift -o /tmp/clipeye
//   /tmp/clipeye scan <src.mp4> [frames]
//   /tmp/clipeye plan <src.mp4> [frames]
//   /tmp/clipeye sheet <src.mp4> <out.jpg> <cols> <thumbWidth>
//   /tmp/clipeye grid <manifest> <out.jpg> [cols] [thumbWidth]
//
// `grid` wants one manifest line per clip: `<path.mp4> x y w h`, or a bare `-` for a clip
// that keeps its whole frame, which is exactly what `plan` prints its rect as.
//
// The owner's ask is that a clip show the sample being printed or packaged and not a wall
// or a face, and neither half of that can be settled by eye across thirty-five clips. So
// each sampled frame is put through the frameworks Apple already ships: text recognition,
// because a printed sample carries words and a painted wall does not; face detection,
// because the person behind the counter must not be the subject; and image
// classification, which will name a wall, a book, a poster or a desk.
//
// `scan` prints one line per sampled instant and a summary line, and the summary carries
// the crop the numbers support: the box that holds the words, widened to a watchable
// aspect, with the share of sampled time a face would fall inside it.
//
// `plan` answers the question a batch actually has to ask: which single rectangle, held
// still for the whole clip, keeps the print and throws away the wall and the people. It
// searches the frame by shrinking each of its four edges in step after step, and scores a
// box by the WORST sampled frame rather than the average — a crop that holds the sample
// five times out of six is a crop that cuts the sample one time out of six, and the
// visitor sees that. A box that would hold a detected face is refused outright, unless
// refusing it means cutting the print, in which case the line says `ambig` and a human
// looks at the clip: a portrait printed on a funeral banner and a face in the shop look
// identical to the detector, and only the owner knows which one is in the frame.
//
// `sheet` tiles the same sampled frames into one JPEG so a human can check the machine's
// reading of a clip in a single look, and draws the planned box on every tile when one is
// given, so the box itself is what gets judged rather than the numbers behind it.
import AVFoundation
import AppKit
import Vision

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data(("clipeye: " + message + "\n").utf8))
  exit(1)
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail("usage: scan|sheet <src> …") }
let mode = args[1]
let src = args[2]
let url = URL(fileURLWithPath: src)
guard FileManager.default.fileExists(atPath: url.path) else { fail("no such file: \(src)") }

// One picture of every clip in the batch, each with its proposed box drawn on it. Thirty-five
// numbers per clip is a table nobody can trust without looking at the film, and this is the
// one look. AppKit draws bottom-up while the boxes are measured from the top of the frame, so
// every rect is turned over on the way in.
if mode == "grid" {
  guard args.count >= 4 else { fail("grid needs <manifest> <out.jpg> [cols] [thumbW]") }
  let dst = args[3]
  let cols = args.count > 4 ? max(1, Int(args[4]) ?? 5) : 5
  let thumb = args.count > 5 ? max(90, Int(args[5]) ?? 200) : 200
  let lines = (try? String(contentsOfFile: src, encoding: .utf8))?.split(separator: "\n").map(String.init) ?? []
  struct Cell {
    var image: CGImage?
    var box: CGRect
    var tag: String
  }
  var cells: [Cell] = []
  for line in lines where !line.trimmingCharacters(in: .whitespaces).isEmpty {
    let parts = line.split(separator: " ").map(String.init)
    guard parts.count >= 2 else { continue }
    let path = parts[0]
    let asset = AVURLAsset(url: URL(fileURLWithPath: path))
    let seconds = CMTimeGetSeconds(asset.duration)
    guard let track = asset.tracks(withMediaType: .video).first, seconds > 0.2 else { continue }
    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.requestedTimeToleranceBefore = CMTime(seconds: 0.3, preferredTimescale: 600)
    gen.requestedTimeToleranceAfter = CMTime(seconds: 0.3, preferredTimescale: 600)
    var image: CGImage?
    for guess in [0.55, 0.4, 0.7, 0.25] {
      image = try? gen.copyCGImage(at: CMTime(seconds: seconds * guess, preferredTimescale: 600),
                                   actualTime: nil)
      if image != nil { break }
    }
    let frame = CGRect(x: 0, y: 0, width: track.naturalSize.width, height: track.naturalSize.height)
    var box = frame
    if parts.count >= 5, parts[1] != "-" {
      let nums = parts[1...4].compactMap { Double($0) }
      if nums.count == 4 { box = CGRect(x: nums[0], y: nums[1], width: nums[2], height: nums[3]) }
    }
    let shown = image.map { CGRect(x: 0, y: 0, width: CGFloat($0.width), height: CGFloat($0.height)) } ?? frame
    let share = Double(area(box.intersection(shown)) / max(area(shown), 1))
    let stem = (path as NSString).lastPathComponent.replacingOccurrences(of: ".mp4", with: "")
    cells.append(Cell(image: image, box: box, tag: "\(stem) \(Int(share * 100))%"))
  }
  guard !cells.isEmpty else { fail("the manifest named nothing readable") }
  var tallest = 0
  for cell in cells {
    guard let image = cell.image else { continue }
    tallest = max(tallest, Int(Double(thumb) * Double(image.height) / Double(image.width)))
  }
  let cellH = tallest + 22
  let rows = (cells.count + cols - 1) / cols
  let size = NSSize(width: cols * thumb, height: rows * cellH)
  let sheet = NSImage(size: size)
  sheet.lockFocus()
  NSColor.black.setFill()
  NSRect(origin: .zero, size: size).fill()
  let label: [NSAttributedString.Key: Any] = [
    .font: NSFont.monospacedSystemFont(ofSize: max(11, CGFloat(thumb) / 26), weight: .semibold),
    .foregroundColor: NSColor.white,
  ]
  NSColor.green.setStroke()
  for (index, cell) in cells.enumerated() {
    guard let image = cell.image else { continue }
    let col = index % cols, row = index / cols
    let x = CGFloat(col * thumb)
    let cellTop = size.height - CGFloat(row * cellH)
    let scale = CGFloat(thumb) / CGFloat(image.width)
    let painted = NSSize(width: CGFloat(image.width) * scale, height: CGFloat(image.height) * scale)
    let top = cellTop - 18
    NSImage(cgImage: image, size: painted)
      .draw(in: NSRect(x: x, y: top - painted.height, width: painted.width, height: painted.height))
    let box = cell.box.intersection(CGRect(x: 0, y: 0, width: CGFloat(image.width), height: CGFloat(image.height)))
    if !box.isNull {
      let stroke = NSBezierPath(rect: NSRect(x: x + box.minX * scale, y: top - (box.maxY) * scale,
                                             width: box.width * scale, height: box.height * scale))
      stroke.lineWidth = 2
      stroke.stroke()
    }
    (cell.tag as NSString).draw(at: NSPoint(x: x + 3, y: top - painted.height - 14), withAttributes: label)
  }
  sheet.unlockFocus()
  guard let tiff = sheet.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
        let data = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.8]) else {
    fail("could not encode the grid")
  }
  do { try data.write(to: URL(fileURLWithPath: dst)) } catch { fail("could not write \(dst)") }
  print("wrote \(dst) \(cols)x\(rows) of \(cells.count) clips")
  exit(0)
}

let item = AVURLAsset(url: url)
let seconds = CMTimeGetSeconds(item.duration)
guard seconds > 0.2 else { fail("clip has no readable duration") }
guard let videoTrack = item.tracks(withMediaType: .video).first else { fail("no video track") }

let generator = AVAssetImageGenerator(asset: item)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = CMTime(seconds: 0.25, preferredTimescale: 600)
generator.requestedTimeToleranceAfter = CMTime(seconds: 0.25, preferredTimescale: 600)

let wanted = args.count > 3 ? (Int(args[3]) ?? 8) : 8
let frames = max(3, min(wanted, 24))
var marks: [Double] = []
for i in 0..<frames { marks.append(seconds * (Double(i) + 0.5) / Double(frames)) }

struct Reading {
  var at: Double
  var width = 0, height = 0
  var text: [CGRect] = []
  var textWords = 0
  var faces: [CGRect] = []
  var labels: [(String, Double)] = []
  var ok = false
}

func analyse(_ image: CGImage) -> (text: [CGRect], words: Int, faces: [CGRect], labels: [(String, Double)]) {
  var textBoxes: [CGRect] = []
  var words = 0
  var faceBoxes: [CGRect] = []
  var named: [(String, Double)] = []
  let handler = VNImageRequestHandler(cgImage: image, options: [:])

  let text = VNRecognizeTextRequest()
  text.recognitionLevel = .accurate
  text.usesLanguageCorrection = false
  let faces = VNDetectFaceRectanglesRequest()
  let classify = VNClassifyImageRequest()
  do { try handler.perform([text, faces, classify]) } catch {
    fail("vision could not run: \(error.localizedDescription)")
  }
  // Vision reports boxes in a normalised space whose origin is the bottom-left. Everything
  // downstream is measured in pixels, because a box that is a tenth of the width is a
  // different shape in a 540x960 clip and in a 2160x3840 one, so each box is flipped into
  // top-left pixel coordinates on the way in.
  let w = CGFloat(image.width), h = CGFloat(image.height)
  for observation in (text.results ?? []) as [VNRecognizedTextObservation] {
    let keep = observation.topCandidates(1).first.map { $0.confidence > 0.4 } ?? false
    if keep {
      let r = observation.boundingBox
      textBoxes.append(CGRect(x: r.minX * w, y: (1 - r.maxY) * h, width: r.width * w, height: r.height * h))
      words += 1
    }
  }
  for face in (faces.results ?? []) as [VNFaceObservation] {
    let r = face.boundingBox
    if (face.confidence ?? 1) > 0.5 && r.width * r.height > 0.002 {
      faceBoxes.append(CGRect(x: r.minX * w, y: (1 - r.maxY) * h, width: r.width * w, height: r.height * h))
    }
  }
  for result in (classify.results ?? []) as [VNClassificationObservation] where result.confidence > 0.2 {
    named.append((result.identifier, Double(result.confidence)))
  }
  return (textBoxes, words, faceBoxes, Array(named.prefix(6)))
}

func frameAt(_ at: Double) -> CGImage? {
  let time = CMTime(seconds: min(max(at, 0.05), max(seconds - 0.1, 0.1)), preferredTimescale: 600)
  return try? generator.copyCGImage(at: time, actualTime: nil)
}

func area(_ r: CGRect) -> CGFloat { max(0, r.width) * max(0, r.height) }

// How much of `inner` survives inside `box`, as a share of its own area. Vision gives one
// box per line of print and one per face, so every decision here is a share, not a point:
// a word that is 90% in the box is in it, and a face that is 30% in the box is still a face
// the visitor will see.
func overlap(_ inner: CGRect, _ box: CGRect) -> CGFloat {
  let a = area(inner)
  guard a > 0 else { return 0 }
  return area(inner.intersection(box)) / a
}

func union(_ boxes: [CGRect]) -> CGRect {
  guard let first = boxes.first else { return .null }
  var box = first
  for r in boxes.dropFirst() { box = box.union(r) }
  return box
}

func reading(_ at: Double) -> Reading {
  var out = Reading(at: at)
  guard let image = frameAt(at) else { return out }
  out.width = image.width
  out.height = image.height
  let result = analyse(image)
  out.text = result.text
  out.textWords = result.words
  out.faces = result.faces
  out.labels = result.labels
  out.ok = true
  return out
}

var readings: [Reading] = []
for mark in marks { readings.append(reading(mark)) }
let usable = readings.filter { $0.ok }
guard !usable.isEmpty else { fail("no frame of \(src) could be read") }

if mode == "plan" {
  let frameW = CGFloat(usable[0].width), frameH = CGFloat(usable[0].height)
  let name = src.split(separator: "/").last.map(String.init) ?? src

  struct Shot { var text: [CGRect] = [], faces: [CGRect] = [], total: CGFloat = 0 }
  let shots = usable.map { each -> Shot in
    var s = Shot()
    s.text = each.text
    s.faces = each.faces
    s.total = each.text.map(area).reduce(0, +)
    return s
  }
  let words = shots.flatMap { $0.text }.count
  guard words > 0 else {
    print("PLAN \(name) action=nocrop reason=no-words-in-any-frame frames=\(shots.count)")
    exit(0)
  }

  // A box is worth nothing for holding the print on average: it has to hold it at the worst
  // instant of the clip, because that instant is on screen for seconds and the visitor sees
  // the sample cut in half. So the score is the minimum, taken across every sampled frame.
  func evaluate(_ box: CGRect) -> (worst: CGFloat, mean: CGFloat, print: CGFloat, faceIn: CGFloat) {
    var worst = CGFloat(1)
    var total = CGFloat(0)
    var keptTotal = CGFloat(0)
    var present = 0
    var faceFrames = 0
    var judged = 0
    for shot in shots {
      // A frame the machine cannot read is not a frame where the print has left the box: a
      // fast pan blurs the words away, and a box would fail for ever if an unreadable
      // instant counted as a missing sample. It still counts against `print` below, which is
      // where a box that mostly frames empty wall is caught.
      if shot.total > 0 {
        var kept = CGFloat(0)
        for b in shot.text { kept += area(b.intersection(box)) }
        worst = min(worst, kept / shot.total)
        total += shot.total
        keptTotal += kept
        judged += 1
      }
      if shot.text.contains(where: { overlap($0, box) >= 0.4 }) { present += 1 }
      if shot.faces.contains(where: { overlap($0, box) >= 0.25 }) { faceFrames += 1 }
    }
    guard judged > 0 else { return (0, 0, 0, CGFloat(faceFrames)) }
    return (worst, keptTotal / max(total, 1), CGFloat(present) / CGFloat(shots.count), CGFloat(faceFrames))
  }

  let full = CGRect(x: 0, y: 0, width: frameW, height: frameH)
  // How often the print is readable at all is a property of the clip, not of the box, so the
  // whole frame sets the baseline a crop has to hold. Without it a clip the camera only
  // caught twice in six samples would fail every candidate, including the uncropped frame.
  let baseline = evaluate(full).print

  // Edges are inset from the four sides, so every candidate is a rectangle that still
  // shares the frame's centre of gravity and never slides a print off one side of it.
  func search(_ steps: [CGFloat], forbidFaces: Bool) -> (box: CGRect, worst: CGFloat, print: CGFloat, mean: CGFloat, faceIn: CGFloat)? {
    var best: (box: CGRect, worst: CGFloat, print: CGFloat, mean: CGFloat, faceIn: CGFloat)?
    for t in steps {
      for b in steps where t + b < 0.72 {
        for l in steps {
          for r in steps where l + r < 0.72 {
            let box = CGRect(x: l * frameW, y: t * frameH,
                             width: (1 - l - r) * frameW, height: (1 - t - b) * frameH)
            let aspect = box.width / box.height
            if aspect < 0.5 || aspect > 2.2 { continue }
            // A box narrower than the print itself is a close-up of one headline, and the
            // visitor stops being able to see the sample as a sample.
            if box.width < frameW * 0.42 || box.height < frameH * 0.34 { continue }
            let score = evaluate(box)
            if forbidFaces && score.faceIn > 0 { continue }
            if score.print < baseline - 1.0 / CGFloat(2 * shots.count) { continue }
            // The worst instant has to be a real share of the print, or the box is holding a
            // corner of it and calling that enough; the average has to be too.
            if score.worst < 0.55 || score.mean < 0.60 { continue }
            guard let now = best else {
              best = (box, score.worst, score.print, score.mean, score.faceIn); continue
            }
            // Hold the print first; only among boxes that hold it just as well take the
            // smaller one, because the smaller box is the one that throws away more wall.
            if score.worst > now.worst + 0.015
              || (abs(score.worst - now.worst) <= 0.015 && area(box) < area(now.box) - 1) {
              best = (box, score.worst, score.print, score.mean, score.faceIn)
            }
          }
        }
      }
    }
    return best
  }

  let coarse = stride(from: CGFloat(0), through: 0.5, by: 0.025).map { $0 }
  let clean = search(coarse, forbidFaces: true)
  let loose = search(coarse, forbidFaces: false)
  let allFaces = shots.flatMap { $0.faces }.count
  guard clean != nil || loose != nil else {
    let reason = allFaces > 0 && words < 8
      ? "no-words-and-a-face-in-the-room" : "no-box-holds-the-print"
    print("PLAN \(name) action=review reason=\(reason) baseline=\(String(format: "%.2f", Double(baseline))) "
      + "frames=\(shots.count) words=\(words) faces=\(allFaces)")
    exit(0)
  }

  // A face inside the chosen box, when a face-free box also exists but holds far less of the
  // print, is the funeral-banner case: the detector cannot tell a portrait printed on the
  // product from a person standing in the shop. That is a human call, not a batch call.
  let chosen = clean ?? loose!
  var review = clean == nil
  if let cleanBox = clean, let roomy = loose, cleanBox.worst < roomy.worst - 0.10 { review = true }

  var rect = chosen.box.integral
  // The encoder wants even edges so chroma stays subsampled on a pixel pair.
  rect.size.width = floor(rect.width / 2) * 2
  rect.size.height = floor(rect.height / 2) * 2

  let share = area(rect) / (frameW * frameH)
  let isFrame = rect.width >= frameW - 2 && rect.height >= frameH - 2
  let action = review ? "review" : (isFrame ? "keep" : "crop")
  print("PLAN \(name) action=\(action) rect=\(Int(rect.minX)),\(Int(rect.minY)),"
    + "\(Int(rect.width)),\(Int(rect.height)) worst=\(String(format: "%.2f", chosen.worst)) "
    + "mean=\(String(format: "%.2f", chosen.mean)) print=\(String(format: "%.2f", chosen.print))/"
    + String(format: "%.2f", Double(baseline)) + " faceIn=\(Int(chosen.faceIn)) "
    + "area=\(String(format: "%.2f", Double(share))) "
    + "from=\(Int(frameW))x\(Int(frameH)) frames=\(shots.count) words=\(words) faces=\(allFaces)")
  exit(0)
}

if mode == "sheet" {
  guard args.count >= 6 else { fail("sheet needs out.jpg cols thumbWidth") }
  let dst = args[3]
  let cols = max(1, Int(args[4]) ?? 4)
  let thumb = max(60, Int(args[5]) ?? 220)
  let aspect = Double(usable[0].height) / Double(usable[0].width)
  let cellH = Int(Double(thumb) * aspect) + 24
  let rows = (usable.count + cols - 1) / cols
  let size = NSSize(width: cols * thumb, height: rows * cellH)
  let sheet = NSImage(size: size)
  sheet.lockFocus()
  NSColor.black.setFill()
  NSRect(origin: .zero, size: size).fill()
  let label: [NSAttributedString.Key: Any] = [
    .font: NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .semibold),
    .foregroundColor: NSColor.white,
  ]
  for (index, each) in usable.enumerated() {
    guard let image = frameAt(each.at) else { continue }
    let col = index % cols, row = index / cols
    let x = CGFloat(col * thumb)
    let top = size.height - CGFloat(row * cellH)
    let tag = "\(Int(each.at))s words=\(each.textWords) faces=\(each.faces.count)" as NSString
    tag.draw(at: NSPoint(x: x + 5, y: top - 17), withAttributes: label)
    NSImage(cgImage: image, size: NSSize(width: thumb, height: cellH - 24))
      .draw(in: NSRect(x: x, y: top - CGFloat(cellH), width: CGFloat(thumb), height: CGFloat(cellH - 24)))
  }
  sheet.unlockFocus()
  guard let tiff = sheet.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
        let data = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.82]) else {
    fail("could not encode the sheet")
  }
  do { try data.write(to: URL(fileURLWithPath: dst)) } catch { fail("could not write \(dst)") }
  print("wrote \(dst) \(cols)x\(rows) of \(usable.count) frames")
  exit(0)
}

// One line per sampled instant: what the machine saw, in the units the crop maths needs.
for each in usable {
  let frameArea = CGFloat(max(1, each.width) * max(1, each.height))
  let cover = area(union(each.text)) / frameArea
  let faceCover = each.faces.map(area).reduce(0, +) / frameArea
  let names = each.labels.map { "\($0.0):\(String(format: "%.2f", $0.1))" }.joined(separator: ",")
  print("t=\(String(format: "%.1f", each.at)) words=\(each.textWords) "
    + "textArea=\(String(format: "%.3f", Double(cover))) faceArea=\(String(format: "%.3f", Double(faceCover))) "
    + "faces=\(each.faces.count) [\(names)]")
}

// The crop: the box that holds the words across the clip, widened to a watchable slice of
// the frame. A tight box around one headline would show a strip of paper and nothing else.
let allText = usable.flatMap { $0.text }
let allFaces = usable.flatMap { $0.faces }
let words = area(union(allText))
let span = union(allText)
let frameW = CGFloat(usable[0].width), frameH = CGFloat(usable[0].height)
let coverShare = Double(words / (frameW * frameH))
let goodTime = Double(usable.filter { !$0.text.isEmpty && $0.faces.isEmpty }.count) / Double(usable.count)
let faceTime = Double(usable.filter { !$0.faces.isEmpty }.count) / Double(usable.count)
let wallish = usable.filter { each in
  let names = each.labels.map { $0.0.lowercased() }
  return each.textWords == 0 && names.contains { $0.contains("wall") || $0.contains("ceiling") || $0.contains("room") }
}.count

// A crop is only offered when the words sit somewhere a rectangle can hold: at least a
// tenth of the frame, and not the whole of it.
var crop = "none"
if !span.isNull, words > frameW * frameH * 0.10, words < frameW * frameH * 0.98 {
  let margin: CGFloat = 0.10
  var box = span.insetBy(dx: -span.width * margin, dy: -span.height * margin)
  // Keep the box inside the frame and give it an aspect the stage can show tall or wide.
  if box.width / box.height < 0.55 {
    let widen = box.height * 0.55
    box = CGRect(x: box.midX - widen / 2, y: box.midY - box.height / 2, width: widen, height: box.height)
  }
  if box.width / box.height > 1.9 {
    let taller = box.width / 1.9
    box = CGRect(x: box.midX - box.width / 2, y: box.midY - taller / 2, width: box.width, height: taller)
  }
  box = box.intersection(CGRect(x: 0, y: 0, width: frameW, height: frameH)) ?? box
  let facesInside = allFaces.filter { $0.intersects(box) && area($0.intersection(box)) / max(area($0), 1) > 0.25 }.count
  crop = "x=\(Int(box.minX)) y=\(Int(box.minY)) w=\(Int(box.width)) h=\(Int(box.height)) facesInside=\(facesInside)"
}

print("SUMMARY \(src.split(separator: "/").last ?? "?") dur=\(String(format: "%.1f", seconds)) "
  + "frames=\(usable.count) textArea=\(String(format: "%.3f", coverShare)) "
  + "clean=\(String(format: "%.2f", goodTime)) face=\(String(format: "%.2f", faceTime)) "
  + "wallish=\(wallish) span=\(Int(span.width))x\(Int(span.height)) crop{\(crop)}")
