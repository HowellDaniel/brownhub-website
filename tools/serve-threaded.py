#!/usr/bin/env python3
"""Threaded static server for the Blink rigs.

python -m http.server answers one request at a time, so a page that pulls a dozen
scripts and pictures in parallel gets a connection reset. That flake used to arrive
as a "clean" rig run whose translate.js never loaded, so the rigs get a server that
cannot serialise them.
"""
import functools
import http.server
import socketserver
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
root = sys.argv[2] if len(sys.argv) > 2 else "."


class KeepAlive(http.server.SimpleHTTPRequestHandler):
    """HTTP/1.1, because the stock handler answers in 1.0 and closes the socket after
    every file — Chrome then reports ERR_CONNECTION_RESET on the next picture it asked
    for on that connection, and a rig gate that trusts the console becomes noise."""
    protocol_version = "HTTP/1.1"


handler = functools.partial(KeepAlive, directory=root)


class Threaded(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


with Threaded(("127.0.0.1", port), handler) as httpd:
    print("serving %s on 127.0.0.1:%d threaded" % (root, port), flush=True)
    httpd.serve_forever()
