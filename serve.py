#!/usr/bin/env python3
"""Tiny static file server for local preview.

Same as `python3 -m http.server` but sends no-store headers so edits show up on
reload without stale-cache surprises. Usage: `python3 serve.py [port]` (default 8000),
then open http://localhost:8000
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    with ThreadingHTTPServer(("", port), NoCacheHandler) as httpd:
        print(f"Hazel's Wearcast running at http://localhost:{port}")
        httpd.serve_forever()
