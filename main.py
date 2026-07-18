"""
main.py -- local development server for the deep.github.io portfolio.

Serves the static site (index.html, src/, assets/, Music/, Symbol/,
audios/, clock/, contactform/, profiles/) exactly as GitHub Pages would,
using Flask, and opens it in your browser automatically.

Usage:
    python main.py                  # serve on http://127.0.0.1:5000
    python main.py --port 8080      # custom port
    python main.py --host 0.0.0.0   # expose on your local network
    python main.py --no-browser     # don't auto-open a browser tab
    python main.py --debug          # enable Flask's auto-reload/debugger
"""

from __future__ import annotations

import argparse
import threading
import webbrowser
from pathlib import Path

from flask import Flask, send_from_directory

ROOT_DIR = Path(__file__).parent.resolve()

app = Flask(__name__, static_folder=None)


@app.route("/")
def index() -> "flask.Response":
    """Serve the main landing page."""
    return send_from_directory(ROOT_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename: str) -> "flask.Response":
    """
    Serve every other file (CSS, JS, images, audio, the clock sub-page,
    contact form script, etc.) straight from the repo root -- this
    mirrors exactly how GitHub Pages serves the same files in production,
    so what you see locally is what you'll see live.
    """
    full_path = ROOT_DIR / filename

    # If the request points at a folder (e.g. "/clock/"), serve that
    # folder's own index.html instead of trying (and failing) to send
    # the directory itself as a file.
    if full_path.is_dir():
        filename = f"{filename.rstrip('/')}/index.html"

    return send_from_directory(ROOT_DIR, filename)


def _open_browser_when_ready(url: str) -> None:
    """Open the site in the user's default browser shortly after startup."""
    threading.Timer(1.0, lambda: webbrowser.open_new_tab(url)).start()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the portfolio site locally.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=5000, help="Port to serve on (default: 5000)")
    parser.add_argument("--no-browser", action="store_true", help="Don't auto-open a browser tab")
    parser.add_argument("--debug", action="store_true", help="Run Flask in debug/auto-reload mode")
    args = parser.parse_args()

    url = f"http://{args.host}:{args.port}"

    if not args.no_browser:
        _open_browser_when_ready(url)

    print(f"Serving deep.github.io locally at {url}  (Ctrl+C to stop)")
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
