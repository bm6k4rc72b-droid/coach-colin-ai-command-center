#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(os.environ.get("PORT", "8765"))
print(f"AngryLiarX → http://127.0.0.1:{port}")
ThreadingHTTPServer(("0.0.0.0", port), SimpleHTTPRequestHandler).serve_forever()
