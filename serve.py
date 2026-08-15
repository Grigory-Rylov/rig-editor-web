#!/usr/bin/env python3
import http.server, socketserver, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
DIR = sys.argv[2] if len(sys.argv) > 2 else '.'

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

os.chdir(DIR)
socketserver.TCPServer.allow_reuse_address = True
print(f"Serving {DIR} on port {PORT}", flush=True)
with socketserver.TCPServer(('0.0.0.0', PORT), H) as s:
    s.serve_forever()
