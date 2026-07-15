"""
Minimal DBAPI 2.0 driver for Turso over HTTP.
Uses httpx (already in requirements) — no Rust, no native compilation.
"""
import httpx

paramstyle = "qmark"
threadsafety = 1
apilevel = "2.0"

_IGNORED = {
    "begin", "begin immediate", "begin deferred", "begin transaction",
    "commit", "commit transaction", "rollback", "rollback transaction",
}


def _encode(v) -> dict:
    if v is None:
        return {"type": "null", "value": None}
    if isinstance(v, bool):
        return {"type": "integer", "value": str(int(v))}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "real", "value": str(v)}
    return {"type": "text", "value": str(v)}


def _decode(cell: dict):
    t = cell.get("type")
    v = cell.get("value")
    if t == "null" or v is None:
        return None
    if t == "integer":
        try:
            return int(v)
        except (TypeError, ValueError):
            return v
    if t == "real":
        try:
            return float(v)
        except (TypeError, ValueError):
            return v
    return v  # text / blob


class Cursor:
    def __init__(self, conn: "Connection"):
        self._conn = conn
        self._rows: list = []
        self.description = None
        self.lastrowid = None
        self.rowcount = -1
        self.arraysize = 1

    def execute(self, sql: str, parameters=None):
        stripped = sql.strip().rstrip(";").strip()
        if stripped.lower() in _IGNORED:
            return self

        args = [_encode(p) for p in (parameters or [])]
        resp = httpx.post(
            self._conn._url,
            headers=self._conn._headers,
            json={
                "requests": [
                    {"type": "execute", "stmt": {"sql": stripped, "args": args}},
                    {"type": "close"},
                ]
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        result = data["results"][0]
        if result["type"] == "error":
            msg = result["error"]["message"]
            # Turso rejects some PRAGMAs (e.g. journal_mode=WAL). Silently ignore
            # them so SQLAlchemy's pysqlite setup doesn't blow up.
            if stripped.lower().startswith("pragma"):
                return self
            raise Exception(msg)

        res = result["response"]["result"]
        cols = res.get("cols", [])
        rows = res.get("rows", [])

        self.description = (
            [(c["name"], None, None, None, None, None, None) for c in cols]
            if cols else None
        )
        self._rows = [tuple(_decode(cell) for cell in row) for row in rows]
        self.rowcount = res.get("affected_row_count", len(self._rows))
        lid = res.get("last_insert_rowid")
        self.lastrowid = int(lid) if lid is not None else None
        return self

    def executemany(self, sql: str, seq_of_params):
        for params in seq_of_params:
            self.execute(sql, params)

    def fetchall(self):
        rows, self._rows = self._rows, []
        return rows

    def fetchone(self):
        return self._rows.pop(0) if self._rows else None

    def fetchmany(self, size: int = None):
        n = size or self.arraysize
        rows, self._rows = self._rows[:n], self._rows[n:]
        return rows

    def close(self):
        self._rows = []

    def setinputsizes(self, *_):
        pass

    def setoutputsize(self, *_):
        pass

    def __iter__(self):
        return iter(self._rows)


class Connection:
    def __init__(self, database: str, auth_token: str):
        base = database.strip().rstrip("/").replace("libsql://", "https://")
        self._url = f"{base}/v2/pipeline"
        self._headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json",
        }

    def cursor(self) -> Cursor:
        return Cursor(self)

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass

    # pysqlite-specific stubs SQLAlchemy calls on connect
    def create_function(self, *_, **__):
        pass

    def create_aggregate(self, *_, **__):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def connect(database: str, auth_token: str) -> Connection:
    return Connection(database, auth_token)
