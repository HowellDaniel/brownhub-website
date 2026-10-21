// Minimal Chrome DevTools Protocol client for verifying site animations in a real
// Blink frame.  cdp <webSocketDebuggerUrl> <expressions.json> [shot-prefix]
// Expressions are this repository's own probe scripts, read from a file I write;
// each is evaluated in order and its JSON return printed on one line.
import Foundation

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: cdp <webSocketDebuggerUrl> <expressions.json> [shot-prefix]\n".data(using: .utf8)!)
    exit(2)
}
let expressions = (try? JSONDecoder().decode([String].self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))) ?? []
let shotPrefix = args.count > 3 ? args[3] : ""

final class CDP: NSObject, URLSessionWebSocketDelegate {
    let session = URLSession(configuration: .default)
    var task: URLSessionWebSocketTask!
    var nextId = 1
    var pending: [Int: ([String: Any]) -> Void] = [:]

    func open(_ url: URL) {
        task = session.webSocketTask(with: url)
        task.delegate = self
        task.resume()
        read()
    }
    func read() {
        task.receive { [weak self] result in
            guard let self = self else { return }
            if case let .success(message) = result, case let .string(text) = message,
               let data = text.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let id = obj["id"] as? Int, let done = self.pending[id] {
                self.pending.removeValue(forKey: id)
                done(obj)
            }
            self.read()
        }
    }
    func send(_ method: String, _ params: [String: Any], timeout: TimeInterval, _ done: @escaping ([String: Any]) -> Void) {
        nextId += 1
        let id = nextId
        var payload: [String: Any] = ["id": id, "method": method]
        if !params.isEmpty { payload["params"] = params }
        pending[id] = done
        let str = String(data: (try! JSONSerialization.data(withJSONObject: payload)), encoding: .utf8)!
        task.send(.string(str)) { _ in }
        DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak self] in
            guard let self = self, let done = self.pending[id] else { return }
            self.pending.removeValue(forKey: id)
            done(["__error": "timeout: " + method])
        }
    }
}

let cdp = CDP()
let sem = DispatchSemaphore(value: 0)
cdp.open(URL(string: args[1])!)

func evaluate(_ expr: String, _ done: @escaping (String) -> Void) {
    cdp.send("Runtime.evaluate", ["expression": expr, "returnByValue": true, "awaitPromise": true], timeout: 90) { res in
        if let e = res["__error"] { done("CDP-ERROR " + String(describing: e)); return }
        let r = res["result"] as? [String: Any] ?? [:]
        if let exc = r["exceptionDetails"] as? [String: Any] {
            done("PAGE-ERROR " + String(describing: exc["exception"] ?? exc["text"] ?? exc)); return
        }
        let out = r["result"] as? [String: Any] ?? [:]
        if let s = out["value"] as? String { done(s) }
        else {
            let data = (try? JSONSerialization.data(withJSONObject: ["value": out["value"] ?? NSNull()])) ?? Data()
            done(String(data: data, encoding: .utf8) ?? "null")
        }
    }
}

func shot(_ path: String, _ done: @escaping () -> Void) {
    /* Under device emulation Page.captureScreenshot keeps taking the top of the
       document, so the shot is clipped to where the probe actually scrolled. */
    evaluate("(JSON.stringify({y:Math.round(window.scrollY),w:innerWidth,h:innerHeight}))") { raw in
        let params: [String: Any]
        let box = (try? JSONSerialization.jsonObject(with: Data(raw.utf8))) as? [String: Any]
        if let b = box, let y = b["y"] as? Int, let w = b["w"] as? Int, let h = b["h"] as? Int, y > 0 {
            params = ["format": "png", "captureBeyondViewport": true,
                      "clip": ["x": 0, "y": y, "width": w, "height": h, "scale": 1]]
        } else {
            params = ["format": "png"]
        }
        cdp.send("Page.captureScreenshot", params, timeout: 90) { res in
            if let data = ((res["result"] as? [String: Any])?["data"] as? String),
               let raw = Data(base64Encoded: data) {
                try? raw.write(to: URL(fileURLWithPath: path))
            }
            done()
        }
    }
}

usleep(500_000)

/* `--window-size` has a 500px floor in headless Chrome, so a phone frame cannot be
   asked for on the command line.  CDP_W/CDP_H (+ optional CDP_DPR) override the real
   device metrics instead, which is what a 390px audit needs. */
func emulate(_ done: @escaping () -> Void) {
    let env = ProcessInfo.processInfo.environment
    guard let w = Int(env["CDP_W"] ?? ""), let h = Int(env["CDP_H"] ?? "") else { done(); return }
    let dpr = Double(env["CDP_DPR"] ?? "1") ?? 1
    cdp.send("Emulation.setDeviceMetricsOverride",
             ["width": w, "height": h, "deviceScaleFactor": dpr, "mobile": true], timeout: 30) { _ in
        cdp.send("Emulation.setTouchEmulationEnabled", ["enabled": true], timeout: 30) { _ in done() }
    }
}

func touch(_ kind: String, _ x: Int, _ y: Int, _ done: @escaping () -> Void) {
    /* A synthetic touchStart never becomes a recognised gesture in headless, so it leaves
       :active alone.  A mouse press does set it, and with touch emulation switched on the
       page still reads (hover:none) — which is exactly what a thumb does to this CSS. */
    let down = kind == "press"
    var params: [String: Any] = ["type": down ? "mousePressed" : "mouseReleased",
                                 "button": "left", "clickCount": 1]
    if down { params["x"] = x; params["y"] = y }
    cdp.send("Input.dispatchMouseEvent", params, timeout: 30) { _ in done() }
}

/* A press is the one phone state no page script can fake: :active only exists while the
   input is down.  `#press <key>` reads the point a probe parked in window.__PP, so the
   coordinate is always the live one rather than a number from an earlier run. */
func pressKey(_ expr: String) -> String? {
    guard expr.hasPrefix("#press ") else { return nil }
    return String(expr.dropFirst(7))
}

var index = 0
var held = false
func frame(_ done: @escaping () -> Void) {
    if shotPrefix.isEmpty { done(); return }
    shot("\(shotPrefix)\(String(format: "%02d", index)).png", done)
}
func step() {
    if index >= expressions.count {
        if held { held = false; touch("release", 0, 0) { sem.signal() } } else { sem.signal() }
        return
    }
    let expr = expressions[index]
    if let key = pressKey(expr) {
        evaluate("(window.__PP&&window.__PP['" + key + "'])||null") { raw in
            let p = raw.replacingOccurrences(of: "[", with: "").replacingOccurrences(of: "]", with: "")
                .split(separator: ",")
            guard p.count == 2, let x = Int(p[0]), let y = Int(p[1]) else {
                print("### [\(index)] NO-PRESS-POINT " + key + " " + raw)
                index += 1; step(); return
            }
            touch("press", x, y) {
                held = true
                print("### [\(index)] PRESS \(key) \(x),\(y)")
                index += 1
                frame { step() }
            }
        }
        return
    }
    if expr == "#release" {
        held = false
        touch("release", 0, 0) {
            print("### [\(index)] RELEASE")
            index += 1
            step()
        }
        return
    }
    evaluate(expr) { out in
        print("### [\(index)] " + out)
        index += 1
        frame { step() }
    }
}
emulate { step() }
sem.wait()
cdp.task.cancel(with: .goingAway, reason: nil)
exit(0)
