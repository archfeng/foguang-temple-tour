"""Serve the local tour and its shared wish register on the LAN."""
import argparse
import json
import re
import sqlite3
from contextlib import closing
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

SITE = Path(__file__).resolve().parent
DB = SITE / "foguang_lan_wishes.sqlite3"
ROUTE = "/api/wishes"
LIMIT = 128


class TourHandler(SimpleHTTPRequestHandler):
    def send_json(self, value, status=HTTPStatus.OK):
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if urlsplit(self.path).path != ROUTE:
            return super().do_GET()
        with closing(sqlite3.connect(DB)) as db, db:
            db.row_factory = sqlite3.Row
            rows = db.execute("SELECT id, tier, name, message FROM wishes ORDER BY slot").fetchall()
        self.send_json([dict(row) for row in rows])

    def do_POST(self):
        if self.path != ROUTE:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        origin = self.headers.get("Origin")
        if origin and origin not in ("http://" + self.headers.get("Host", ""), "https://" + self.headers.get("Host", "")):
            self.send_json({"error": "请从当前游览页许愿。"}, HTTPStatus.FORBIDDEN)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 1 <= length <= 4096 or self.headers.get_content_type() != "application/json":
                raise ValueError
            item = json.loads(self.rfile.read(length))
            player, tier = item["player"], item["tier"]
            name, message = item["name"].strip(), item["message"].strip()
            if not re.fullmatch(r"[0-9a-f]{32}", player) or type(tier) is not int or tier not in (100, 1000):
                raise ValueError
            if not 1 <= len(name) <= 16 or not 1 <= len(message) <= 120:
                raise ValueError
        except (ValueError, TypeError, AttributeError, KeyError):
            self.send_json({"error": "请检查名字和愿望。"}, HTTPStatus.BAD_REQUEST)
            return

        wish_id = f"{player}-{tier}"
        with closing(sqlite3.connect(DB)) as db, db:
            db.row_factory = sqlite3.Row
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT id, tier, name, message FROM wishes WHERE id=?", (wish_id,)).fetchone()
            if row:
                self.send_json(dict(row))
                return
            if db.execute("SELECT COUNT(*) FROM wishes").fetchone()[0] >= LIMIT:
                self.send_json({"error": "这段石栏已经系满了。"}, HTTPStatus.CONFLICT)
                return
            db.execute("INSERT INTO wishes(id,tier,name,message) VALUES(?,?,?,?)", (wish_id, tier, name, message))
        self.send_json({"id": wish_id, "tier": tier, "name": name, "message": message}, HTTPStatus.CREATED)


def main():
    import os
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default=os.getenv("BIND", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8895")))
    args = parser.parse_args()
    with closing(sqlite3.connect(DB)) as db, db:
        db.execute("""CREATE TABLE IF NOT EXISTS wishes(
            slot INTEGER PRIMARY KEY, id TEXT UNIQUE, tier INTEGER, name TEXT, message TEXT
        )""")
    with ThreadingHTTPServer((args.bind, args.port), partial(TourHandler, directory=str(SITE))) as server:
        print(f"佛光寺预览 http://{args.bind}:{args.port}/", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
