import http.server
import socketserver
import os
import sys

# Thêm đường dẫn project vào sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
sys.path.insert(0, project_root)

# Cấu hình port
PORT = 8000

# Thay đổi thư mục làm việc về thư mục client để phục vụ file HTML
client_dir = os.path.join(project_root, 'client')
os.chdir(client_dir)

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Thêm CORS headers để cho phép WebSocket kết nối
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        # Xử lý preflight requests
        self.send_response(200)
        self.end_headers()

def start_http_server():
    """Khoi dong HTTP server de phuc vu file HTML"""
    try:
        with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
            print(f"[HTTP SERVER] Dang chay tren http://localhost:{PORT}")
            print(f"[HTTP SERVER] Thu muc goc: {client_dir}")
            print(f"[HTTP SERVER] Truy cap game tai: http://localhost:{PORT}/index.html")
            print("[HTTP SERVER] Nhan Ctrl+C de dung server")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[HTTP SERVER] Da dung server")
    except OSError as e:
        if e.errno == 10048:  # Port already in use
            print(f"[ERROR] Port {PORT} da duoc su dung. Hay kiem tra xem co server nao dang chay khong.")
        else:
            print(f"[ERROR] Loi khoi dong HTTP server: {e}")

if __name__ == "__main__":
    start_http_server()