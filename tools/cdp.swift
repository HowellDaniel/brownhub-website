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
    cdp.send("Page.captureScreenshot", ["format": "png"], timeout: 90) { res in
        if let data = ((res["result"] as? [String: Any])?["data"] as? String),
           let raw = Data(base64Encoded: data) {
            try? raw.write(to: URL(fileURLWithPath: path))
        }
        done()
    }
}

usleep(500_000)
var index = 0
func step() {
    if index >= expressions.count { sem.signal(); return }
    let expr = expressions[index]
    evaluate(expr) { out in
        print("### [\(index)] " + out)
        index += 1
        if shotPrefix.isEmpty { step(); return }
        shot("\(shotPrefix)\(String(format: "%02d", index)).png") { step() }
    }
}
step()
sem.wait()
cdp.task.cancel(with: .goingAway, reason: nil)
exit(0)
