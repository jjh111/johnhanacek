#!/usr/bin/env python3
import http.server
import socketserver

PORT = 8000

class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

with socketserver.TCPServer(("", PORT), CORSHTTPRequestHandler) as httpd:
    print(f"Server running at http://localhost:{PORT}")
    httpd.serve_forever()
