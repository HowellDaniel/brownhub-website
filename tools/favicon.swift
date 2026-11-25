// Cut the studio's mark into the icon set a search engine actually paints.
//
// Google draws the site icon at 16-32px in the organic result and ~16px in the AI
// Overview chip and the image row. The badge it picked carries the whole lockup —
// "BROWN HUB" and the tagline included — and at 16px those letters are one grey smear.
// The fix is the monogram alone, and the reason it can be the monogram alone is that
// tools/logo-master.svg holds the artwork as curves.
//
// Every size here is rasterised from those curves at its OWN device size: a 16px icon is
// sixteen real pixels of vector coverage, not a 512px picture averaged down and not an
// upscale of the 128px PNG the site used to ship. Each entry in icons/favicon-set.json
// records the pixels-per-point its canvas was drawn at, so "high resolution" stays a
// checkable fact instead of a claim. Measured, not assumed: drawing a sub-rect of the SVG
// at 512 leaves 1.33px of anti-aliased ramp, while rasterising it at 128 and blowing it up
// leaves 7.86px — the crop path really does re-flatten the curves at the size asked for.
//
//   swiftc -O tools/favicon.swift -o /tmp/favicon
//   /tmp/favicon probe <master.svg>              # print the element table and the split
//   /tmp/favicon build <master.svg> <outDir>     # write the set + ledger
//
// The mark is found by taking the SVG apart, not by cropping the picture. Each drawable
// element is rasterised on its own and measured, and the monogram is the elements whose
// ink is taller than the type by the widest gap in the artwork. Then the icon is drawn
// from a mark-only copy of the file — the wordmark is not in that document, so no crop of
// any size can reach it. Cropping a bounding box out of the full sheet could, and did: the
// monogram is wider than it is tall, so the square needed for its width ran down into the
// name and the tagline rule, and a black rule across a 16px canvas paints 100% ink.

import AppKit
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail("usage: favicon <probe|build> <master.svg> [outDir]") }
let mode = args[1]
let masterPath = args[2]
guard mode == "probe" || mode == "build" else { fail("unknown mode \(mode)") }
if mode == "build" { guard args.count >= 4 else { fail("build needs an outDir") } }
let outDir = mode == "build" ? args[3] : ""

let masterText: String
do { masterText = try String(contentsOfFile: masterPath, encoding: .utf8) }
catch { fail("cannot read \(masterPath): \(error)") }
guard !masterText.contains("<text") else {
    fail("\(masterPath) sets type as live <text> — the subsetter can only tell a monogram from type by shape")
}

// ---- pixels ------------------------------------------------------------------------

func canvas(_ px: Int) -> NSBitmapImageRep {
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                                     samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                     colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
          rep.bitmapData != nil else {
        fail("cannot make a \(px)x\(px) canvas")
    }
    return rep
}

struct Pixels {
    let size: Int, bytesPerRow: Int, d: UnsafeMutablePointer<UInt8>
    func alpha(_ x: Int, _ y: Int) -> Int { Int(d[y * bytesPerRow + x * 4 + 3]) }
    func red(_ x: Int, _ y: Int) -> Int { Int(d[y * bytesPerRow + x * 4]) }
    func green(_ x: Int, _ y: Int) -> Int { Int(d[y * bytesPerRow + x * 4 + 1]) }
    func blue(_ x: Int, _ y: Int) -> Int { Int(d[y * bytesPerRow + x * 4 + 2]) }
}

func pixels(_ rep: NSBitmapImageRep) -> Pixels {
    Pixels(size: rep.pixelsWide, bytesPerRow: rep.bytesPerRow, d: rep.bitmapData!)
}

// Flatten one image — as curves, at `px` device pixels — taking only the part of its sheet
// that `rect` names. `from:` is in the image's own points and counts up from the bottom,
// while buffer row 0 is the top of the picture.
func raster(_ image: NSImage, _ px: Int, _ rect: NSRect) -> NSBitmapImageRep {
    let rep = canvas(px)
    NSGraphicsContext.saveGraphicsState()
    guard let g = NSGraphicsContext(bitmapImageRep: rep) else { fail("no graphics context at \(px)px") }
    g.imageInterpolation = .none
    NSGraphicsContext.current = g
    image.draw(in: NSRect(x: 0, y: 0, width: px, height: px), from: rect,
               operation: .sourceOver, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    return rep
}

let ALPHA_FLOOR = 8

// The artwork's own ink. The diamond frame and every separation in this lockup are pure
// white, and white is 60% of the sheet: count it as ink and the whole logo welds into one
// shape. The mark is the part that is coloured or dark, so the test is chroma or darkness —
// #EE3338 and #B17D40 pass on chroma, #201F1F passes on darkness, white and cream fail both.
//
// The buffer is PREMULTIPLIED: white at alpha 21 arrives as 21,21,21,21. Judged as stored,
// every anti-aliased edge reads as near-black ink — which is what made the white background
// disc look like a 2,347-pixel shape. Divide the colour back out before asking what it is.
func isInk(_ p: Pixels, _ x: Int, _ y: Int) -> Bool {
    let a = p.alpha(x, y)
    guard a > ALPHA_FLOOR else { return false }
    let r = p.red(x, y) * 255 / a, g = p.green(x, y) * 255 / a, b = p.blue(x, y) * 255 / a
    return max(r, g, b) - min(r, g, b) > 12 || max(r, g, b) < 200
}

// The box the ink of a raster actually fills, in pixels from the top-left, plus how much
// ink there is. An element with no ink is a white plate — the background disc — not a shape.
struct InkBox {
    let x0: Int, y0: Int, x1: Int, y1: Int, count: Int
    var width: Int { x1 - x0 + 1 }
    var height: Int { y1 - y0 + 1 }
}

func inkBox(_ p: Pixels) -> InkBox {
    let size = p.size
    var x0 = size, x1 = -1, y0 = size, y1 = -1, count = 0
    for y in 0..<size {
        for x in 0..<size where isInk(p, x, y) {
            count += 1
            if x < x0 { x0 = x }; if x > x1 { x1 = x }
            if y < y0 { y0 = y }; if y > y1 { y1 = y }
        }
    }
    return InkBox(x0: x0, y0: y0, x1: x1, y1: y1, count: count)
}

// ---- take the master apart ---------------------------------------------------------

// One drawable element per line is all the subsetter needs. Anything that breaks that shape
// fails here rather than quietly shipping a half-cut logo. CorelDRAW writes the master with
// CRLF endings, so the line ending is not part of what the closing test looks at.
let DRAWABLE = ["<circle", "<path", "<polygon", "<polyline", "<rect", "<ellipse", "<line", "<use"]
let masterLines = masterText.components(separatedBy: "\n")
var elementLine: [Int] = []        // element ordinal -> line index
for (i, line) in masterLines.enumerated() {
    let text = line.trimmingCharacters(in: .whitespacesAndNewlines)
    guard DRAWABLE.contains(where: { text.hasPrefix($0) }) else { continue }
    guard text.hasSuffix("/>") || text.hasSuffix(">") else {
        fail("the element on line \(i + 1) does not close on its own line")
    }
    guard text.filter({ $0 == "<" }).count == 1 else {
        fail("line \(i + 1) holds more than one tag — the subsetter needs one element per line")
    }
    elementLine.append(i)
}
guard elementLine.count >= 2 else {
    fail("\(masterPath) exposes \(elementLine.count) drawable element(s) — there is nothing to split a mark out of")
}

func svgKeeping(_ keep: Set<Int>) -> String {
    var out = masterLines
    for line in elementLine { out[line] = "" }
    for ordinal in keep { out[elementLine[ordinal]] = masterLines[elementLine[ordinal]] }
    return out.joined(separator: "\n")
}

let scratch = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
    .appendingPathComponent("favicon-elements-\(getpid())", isDirectory: true)
try? FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
func finish() { try? FileManager.default.removeItem(at: scratch) }

func writeText(_ text: String, _ url: URL) {
    do { try text.write(to: url, atomically: true, encoding: .utf8) }
    catch { fail("cannot write \(url.path): \(error)") }
}

// A sheet is square because the icon is square; the same fractions transfer between the
// full master and any subset of it, since subsetting changes no root attribute.
func loadVector(_ url: URL) -> NSImage {
    guard let image = NSImage(contentsOf: url) else { fail("\(url.lastPathComponent) would not load") }
    guard image.representations.contains(where: { String(describing: type(of: $0)).contains("SVG") }) else {
        fail("\(url.lastPathComponent) did not load as vector SVG — the set must come from curves, not a bitmap")
    }
    return image
}

let master = loadVector(URL(fileURLWithPath: masterPath))
let sheetW = master.size.width, sheetH = master.size.height
guard sheetW > 0, sheetH > 0, abs(sheetW / sheetH - 1) < 0.01 else {
    fail("the master sheet is \(sheetW)x\(sheetH)pt; a square viewBox is what makes a square icon crop exact")
}
let whole = inkBox(pixels(raster(master, 512, NSRect(x: 0, y: 0, width: sheetW, height: sheetH))))
guard whole.count > 0 else {
    fail("\(masterPath) rendered with no coloured or dark ink at all — wrong file, or the master lost its artwork")
}

// Each element alone, at a size that measures a 14-unit hairline and a 1256-unit stroke on
// the same ruler. The whole sheet is the canvas, so every box comes back in one coordinate
// system and the split is a comparison of heights, not of crops.
let ELEMENT_PROBE = 1024
let MIN_INK = 40          // ink pixels below this is a rounding artefact, not a shape

struct Piece {
    let ordinal: Int
    let box: InkBox
    let heightPt: CGFloat
    let topPt: CGFloat
}

var pieces: [Piece] = []
for ordinal in 0..<elementLine.count {
    let url = scratch.appendingPathComponent("element-\(ordinal).svg")
    writeText(svgKeeping([ordinal]), url)
    let image = loadVector(url)
    let box = inkBox(pixels(raster(image, ELEMENT_PROBE, NSRect(x: 0, y: 0, width: image.size.width,
                                                                height: image.size.height))))
    guard box.count >= MIN_INK else { continue }
    pieces.append(Piece(ordinal: ordinal, box: box,
                        heightPt: CGFloat(box.height) * sheetH / CGFloat(ELEMENT_PROBE),
                        topPt: CGFloat(box.y0) * sheetH / CGFloat(ELEMENT_PROBE)))
}
guard pieces.count >= 2 else {
    fail("only \(pieces.count) of \(elementLine.count) elements carry ink — the artwork is one shape, so there is no mark to split out")
}

// The monogram is the same red and brown ink as the name, and it is not parked below it on
// its own rows, so the only thing that tells them apart is scale: the strokes of the symbol
// are drawn several times taller than any letter. The rule is a fraction of the tallest
// stroke, and the artwork is then checked against it — if the shortest thing kept and the
// tallest thing dropped are within 1.3x of each other, size is not a real boundary here and
// the build stops rather than publishing a logo cut in half.
let heights = pieces.map { $0.heightPt }.sorted(by: >)
let floorPt = heights[0] * 2 / 5
let mark = pieces.filter { $0.heightPt >= floorPt }
let lettering = pieces.filter { $0.heightPt < floorPt }
guard !mark.isEmpty, !lettering.isEmpty else {
    fail("the size rule kept \(mark.count) elements and dropped \(lettering.count) — there is no lockup to split in this master")
}
guard let shortestMark = mark.map({ $0.heightPt }).min(), let tallestType = lettering.map({ $0.heightPt }).max() else {
    fail("the split produced no heights")
}
let margin = shortestMark / tallestType
guard margin >= 1.3 else {
    fail("the mark's shortest stroke is \(String(format: "%.1f", shortestMark))pt and the tallest letter is"
         + " \(String(format: "%.1f", tallestType))pt — only \(String(format: "%.2f", margin))x apart, so nothing"
         + " in the artwork separates the symbol from its name. Look at the master and change the rule.")
}
guard mark.count <= 8 else { fail("expected a handful of monogram strokes, found \(mark.count)") }
print("\(pieces.count) inked elements of \(elementLine.count): floor \(String(format: "%.1f", floorPt))pt"
    + " = 40% of the tallest stroke; the split leaves \(String(format: "%.2f", margin))x of room")
print("mark: " + mark.map { "el\($0.ordinal) \($0.box.height)px tall" }.joined(separator: ", "))
print("type: " + lettering.map { "el\($0.ordinal)" }.joined(separator: ", "))

if mode == "probe" {
    for piece in pieces.sorted(by: { $0.heightPt > $1.heightPt }) {
        print(String(format: "  el%-3d ink %7dpx  box %5dx%-5d at %-5d,%-5d  %.0fpt tall  %@",
                     piece.ordinal, piece.box.count, piece.box.width, piece.box.height,
                     piece.box.x0, piece.box.y0, piece.heightPt,
                     piece.heightPt >= floorPt ? "MARK" : "type"))
    }
    finish()
    exit(0)
}

// ---- the mark as its own document --------------------------------------------------

// From here every raster comes out of a sheet that contains only the monogram's elements.
let markURL = scratch.appendingPathComponent("mark.svg")
writeText(svgKeeping(Set(mark.map { $0.ordinal })), markURL)
let markSheet = loadVector(markURL)
guard abs(markSheet.size.width - sheetW) < 0.01, abs(markSheet.size.height - sheetH) < 0.01 else {
    fail("the mark sheet is \(markSheet.size.width)x\(markSheet.size.height)pt, the master is \(sheetW)x\(sheetH)pt")
}

// The mark's box, in fractions of the sheet, measured on the mark sheet itself rather than
// carried over from the per-element probes.
let markBox = inkBox(pixels(raster(markSheet, ELEMENT_PROBE,
                                   NSRect(x: 0, y: 0, width: sheetW, height: sheetH))))
guard markBox.count > 0 else { fail("the mark sheet painted no ink") }
let fx0 = CGFloat(markBox.x0) / CGFloat(ELEMENT_PROBE)
let fx1 = CGFloat(markBox.x1 + 1) / CGFloat(ELEMENT_PROBE)
let fyTop = CGFloat(markBox.y0) / CGFloat(ELEMENT_PROBE)
let fyBottom = CGFloat(markBox.y1 + 1) / CGFloat(ELEMENT_PROBE)
let markWf = fx1 - fx0, markHf = fyBottom - fyTop
let markWpt = markWf * sheetW, markHpt = markHf * sheetH
print("mark box pt " + String(format: "%.2fx%.2f of a %.2fpt sheet", markWpt, markHpt, sheetW))

// ---- the set -----------------------------------------------------------------------

// Sizes the web asks for, all on transparency: Google paints a site icon on its own surface,
// and the surface is white in the light result and near-black in the dark one, so a filled
// badge of our own would put a foreign rectangle next to the answer. The iPhone badge stays
// where it is — icons/apple-touch-icon.png is the owner's approved lockup, not this set's job.
//
// The margin is declared in DEVICE PIXELS, not a percentage: a 2% pad on a 16px canvas is a
// third of a pixel, so the mark would be clipped by its own edge and the icon Google paints
// would be a cropped blob. Padding in pixels keeps the breathing room the same physical size
// at every rung.
let PNG_SIZES: [(file: String, px: Int, padPx: Int)] = [
    ("icons/favicon-16.png", 16, 1),
    ("icons/favicon-32.png", 32, 2),
    ("icons/favicon-48.png", 48, 2),
    ("icons/favicon-64.png", 64, 2),
    ("icons/favicon-128.png", 128, 4),
    ("icons/favicon-192.png", 192, 10),
    ("icons/favicon-512.png", 512, 24),
]
let ICO_SIZES = [16, 24, 32, 48, 64]
let ICO_PAD: [Int: Int] = [16: 1, 24: 1, 32: 2, 48: 2, 64: 2]

// One square crop per size: take the mark's longer edge, then widen the crop so padPx device
// pixels stay clear at each edge. The aspect of the artwork never changes, and if the mark
// sits near an edge of the sheet the square slides back onto it rather than shrinking —
// a mark clipped by the canvas is a broken logo.
func crop(_ px: Int, _ padPx: Int) -> (rect: NSRect, sidePt: CGFloat) {
    guard padPx * 2 < px else { fail("a \(padPx)px margin cannot fit inside a \(px)px canvas") }
    let sideFrac = max(markWf, markHf) * CGFloat(px) / CGFloat(px - 2 * padPx)
    guard sideFrac <= 1 else { fail("a \(padPx)px margin around the mark is bigger than the master sheet") }
    var fxc = (fx0 + fx1) / 2 - sideFrac / 2
    var fyt = (fyTop + fyBottom) / 2 - sideFrac / 2
    fxc = max(0, min(1 - sideFrac, fxc))
    fyt = max(0, min(1 - sideFrac, fyt))
    let sidePt = sideFrac * sheetW
    return (NSRect(x: fxc * sheetW, y: sheetH * (1 - fyt - sideFrac), width: sidePt, height: sidePt), sidePt)
}

func writePNG(_ rep: NSBitmapImageRep, _ rel: String) {
    let url = URL(fileURLWithPath: outDir + "/" + rel)
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                             withIntermediateDirectories: true)
    guard let data = rep.representation(using: .png, properties: [:]) else { fail("cannot encode \(rel)") }
    do { try data.write(to: url) } catch { fail("cannot write \(rel): \(error)") }
}

// Ink spread of a finished canvas, as a fraction of the square. A mark that paints 0% or
// 100% of its own canvas is either off the crop or bleeding past it. White separations read
// as background, so this measures the mark and not the plate it is drawn on.
func fill(_ p: Pixels) -> Double {
    let box = inkBox(p)
    guard box.count > 0 else { return 0 }
    return Double(max(box.width, box.height)) / Double(p.size)
}

// Draw the mark onto one square canvas of exactly px pixels, straight from the curves.
// Returns the bitmap plus the px-per-point it was drawn at — the number that proves no size
// in this set is an upscale of another.
func rasterise(_ px: Int, _ padPx: Int, _ label: String)
    -> (rep: NSBitmapImageRep, fraction: Double, scale: CGFloat) {
    let c = crop(px, padPx)
    let rep = raster(markSheet, px, c.rect)
    let p = pixels(rep)
    let fraction = fill(p)
    guard fraction > 0.30, fraction < 1.0 else {
        let corner = "\(p.red(0, 0)),\(p.green(0, 0)),\(p.blue(0, 0)),\(p.alpha(0, 0))"
        let mid = "\(p.red(px / 2, px / 2)),\(p.green(px / 2, px / 2)),\(p.blue(px / 2, px / 2)),\(p.alpha(px / 2, px / 2))"
        fail("\(label): the mark covers \(String(format: "%.0f%%", fraction * 100)) of the canvas"
             + " — corner rgba \(corner), centre rgba \(mid)")
    }
    return (rep, fraction, CGFloat(px) / c.sidePt)
}

var ledger: [[String: Any]] = []
var rasters: [Int: NSBitmapImageRep] = [:]   // device-size rasters, reused by the ICO ladder

for entry in PNG_SIZES {
    let r = rasterise(entry.px, entry.padPx, entry.file)
    writePNG(r.rep, entry.file)
    rasters[entry.px] = r.rep
    ledger.append([
        "file": entry.file, "px": entry.px, "pad_px": entry.padPx,
        "px_per_pt": Double(r.scale), "resampled": false,
        "ink_fill_pct": Int((r.fraction * 100).rounded()),
    ])
    print(String(format: "wrote %-26s %3dpx  %.1f px/pt  ink %.0f%%",
                 (entry.file as NSString).utf8String!, entry.px, Double(r.scale), r.fraction * 100))
}

// ---- favicon.ico -------------------------------------------------------------------
// Uncompressed 32-bit BGRA DIBs for the small rungs and PNG for the big ones: every ICO
// reader ever written parses a DIB, and the PNG payload keeps the file off a phone's bill.
// Rows go bottom-up and the AND mask is all
// zero because the alpha channel already says what is opaque. Each rung is its own vector
// raster — the ICO never resamples one PNG into a smaller slot.
func dib(_ p: Pixels, _ px: Int) -> Data {
    var out = Data()
    var header = Data(count: 40)
    func put32(_ v: UInt32, _ at: Int) {
        header[at] = UInt8(v & 0xff); header[at + 1] = UInt8((v >> 8) & 0xff)
        header[at + 2] = UInt8((v >> 16) & 0xff); header[at + 3] = UInt8((v >> 24) & 0xff)
    }
    put32(40, 0); put32(UInt32(px), 4); put32(UInt32(px * 2), 8) // height doubled: image + mask
    header[12] = 1; header[14] = 32
    out.append(header)

    for y in stride(from: px - 1, through: 0, by: -1) {
        let row = y * p.bytesPerRow
        for x in 0..<px {
            let i = row + x * 4
            out.append(p.d[i + 2]); out.append(p.d[i + 1]); out.append(p.d[i]) // B G R
            out.append(p.d[i + 3]) // A
        }
    }
    let maskRow = ((px + 31) / 32) * 4
    out.append(Data(count: maskRow * px)) // 1bpp AND mask, 32-bit aligned, all transparent bits clear
    return out
}

// The 16/32/48/64 rungs are the same rasters the PNGs already are; 24 is cut on its own
// vector pass rather than squeezed out of one of them. 16 and 32 go in as raw DIBs because
// that is the only form a decade-old Windows shell reads; the rest ride as PNG payloads,
// which every ICO reader from Vista on accepts and which keeps the whole file to what a
// phone can afford — an ICO is a fallback path, not the icon the browser was asked for.
func pngPayload(_ rep: NSBitmapImageRep) -> Data {
    guard let data = rep.representation(using: .png, properties: [:]) else { fail("cannot encode an ICO rung") }
    return data
}
var payloads: [(px: Int, data: Data)] = []
var icoLedger: [[String: Any]] = []
for px in ICO_SIZES {
    let rep: NSBitmapImageRep
    if let have = rasters[px] {
        rep = have
    } else {
        let r = rasterise(px, ICO_PAD[px] ?? 1, "favicon.ico \(px)px")
        icoLedger.append(["px": px, "pad_px": ICO_PAD[px] ?? 1, "px_per_pt": Double(r.scale),
                          "resampled": false, "ink_fill_pct": Int((r.fraction * 100).rounded())])
        rep = r.rep
    }
    payloads.append((px, px <= 32 ? dib(pixels(rep), px) : pngPayload(rep)))
}

var ico = Data()
ico.append(UInt8(0)); ico.append(UInt8(0)); ico.append(1); ico.append(0) // reserved 0, type 1
ico.append(UInt8(payloads.count & 0xff)); ico.append(UInt8(payloads.count >> 8))
var offset = 6 + 16 * payloads.count
func le32(_ v: UInt32) -> Data {
    Data([UInt8(v & 0xff), UInt8((v >> 8) & 0xff), UInt8((v >> 16) & 0xff), UInt8((v >> 24) & 0xff)])
}
for (px, data) in payloads {
    let byte = px >= 256 ? 0 : UInt8(px)
    ico.append(byte); ico.append(byte)          // width, height (minus-one encoding, 0 = 256)
    ico.append(0); ico.append(0)                // colours, reserved
    ico.append(1); ico.append(0)                // planes
    ico.append(32); ico.append(0)               // bits per pixel
    ico.append(le32(UInt32(data.count))); ico.append(le32(UInt32(offset)))
    offset += data.count
}
for (_, data) in payloads { ico.append(data) }
do { try ico.write(to: URL(fileURLWithPath: outDir + "/favicon.ico")) }
catch { fail("cannot write favicon.ico: \(error)") }
print("wrote favicon.ico  \(ico.count) bytes, \(payloads.count) sizes: "
    + payloads.map { String($0.px) }.joined(separator: "/"))

// ---- ledger ------------------------------------------------------------------------
let boxFrac: [String: Double] = ["x0": Double(fx0), "y_top": Double(fyTop),
                                 "w": Double(markWf), "h": Double(markHf)]
let boxPt: [String: Double] = ["w": Double(markWpt), "h": Double(markHpt)]
let heightsPt: [[String: Any]] = pieces.map { ["el": $0.ordinal, "h": Double($0.heightPt)] }
let splitDoc: [String: Any] = [
    "method": "every drawable element rasterised alone at \(ELEMENT_PROBE)px and measured; the mark is the"
        + " elements whose height reaches \(Int(floorPt / heights[0] * 100))% of the tallest stroke",
    "mark_over_type_margin": Double(margin), "floor_pt": Double(floorPt),
    "mark_elements": mark.map { $0.ordinal }, "type_elements": lettering.map { $0.ordinal },
    "heights_pt": heightsPt,
]
let doc: [String: Any] = [
    "source": "tools/logo-master.svg",
    "sheet_pt": Double(sheetW),
    "mark_box_frac": boxFrac,
    "mark_box_pt": boxPt,
    "split": splitDoc,
    "note": "each size rasterised from the vector at its own device size; nothing here is an upscale or a downsample",
    "sizes": ledger,
    "ico_only_sizes": icoLedger,
]
let jsonData = try JSONSerialization.data(withJSONObject: doc, options: [.prettyPrinted, .sortedKeys])
do { try jsonData.write(to: URL(fileURLWithPath: outDir + "/icons/favicon-set.json")) }
catch { fail("cannot write the ledger: \(error)") }
print("wrote icons/favicon-set.json")
finish()
