import subprocess
import sys
import os
import time
import urllib.request
import webview

APP_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = os.environ.get("PORT", "3141")
URL = f"http://localhost:{PORT}"
server = None


def server_up():
    try:
        urllib.request.urlopen(URL, timeout=1)
        return True
    except Exception:
        return False


def stop_server():
    global server
    if server and server.poll() is None:
        server.terminate()
        try:
            server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()
    server = None


def start_server():
    global server
    if server_up():
        return
    startupinfo = None
    flags = 0
    if os.name == "nt":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        flags = subprocess.CREATE_NO_WINDOW
    server = subprocess.Popen(
        ["node", "server.js"],
        cwd=APP_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=flags,
        startupinfo=startupinfo,
    )
    for _ in range(50):
        if server_up():
            return
        time.sleep(0.2)
    raise RuntimeError("Could not start LifePlanner server")


def main():
    try:
        start_server()
        window = webview.create_window("LifePlanner", URL, width=1080, height=720)
        webview.start()
    finally:
        print("LifePlanner window closed — server left running for task notifications (stop with stop.bat)")


if __name__ == "__main__":
    main()
