#!/usr/bin/env python3
"""
Local preview server for ArtPro Gallery (use while offline / on a hotspot).

    python dev-server.py
    -> open  http://127.0.0.1:8099/index   (or any page, e.g. /catalog)

Serves the ./public folder AND fakes GET /api/public/pieces from the artwork
images in public/assets/images/artworks/, so catalogue-driven pages fill even
without the live Cloudflare Worker. Ctrl+C to stop.
"""
import http.server, socketserver, os, glob, json

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
PORT = 8099
os.chdir(ROOT)

imgs = sorted(glob.glob("assets/images/artworks/*.jpg"))
pieces = [{"pid": f"p{i}", "photo": p.replace("\\", "/"), "id": f"X-{i}",
           "desc": os.path.basename(p), "artist": "Preview", "medium": "Oil",
           "status": "On display", "loc": "", "featured": i < 6}
          for i, p in enumerate(imgs)]
# exercise the real-dimension paths: big framed / small framed / frameless
SIZES = [{"art": "119 x 89 cm", "frame": "143 x 112 cm"},
         {"art": "40 x 30 cm",  "frame": ""},
         {"art": "90 x 60 cm",  "frame": "No frame"}]
for i, s in enumerate(SIZES):
    if i < len(pieces):
        pieces[i].update(s)
PIECES = json.dumps({"pieces": pieces}).encode()

class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/public/pieces":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(PIECES)))
            self.end_headers(); self.wfile.write(PIECES); return
        if path == "/api/health":
            self.send_response(200); self.send_header("Content-Type", "application/json")
            self.end_headers(); self.wfile.write(b'{"ok":true}'); return
        if path.endswith("/"):
            self.path = path + "index.html"
        elif "." not in os.path.basename(path):   # extensionless -> .html (e.g. /catalog)
            self.path = path + ".html"
        return super().do_GET()
    def log_message(self, *a): pass

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), H) as httpd:
    print(f"ArtPro local preview:  http://127.0.0.1:{PORT}/index")
    print(f"({len(pieces)} preview artworks)  Ctrl+C to stop.")
    httpd.serve_forever()
