"""
SQLite database layer for the door lock system.

All tables live in a single doorlock.db file using WAL mode for safe
concurrent reads from the streaming and sensor threads.
"""

import sqlite3
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "doorlock.db")


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS members (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Member',
            added_date TEXT NOT NULL,
            face_enrolled INTEGER NOT NULL DEFAULT 0,
            face_profile_version INTEGER NOT NULL DEFAULT 0,
            last_enrolled_at TEXT,
            liveness_score REAL
        );

        CREATE TABLE IF NOT EXISTS face_encodings (
            id TEXT PRIMARY KEY,
            member_id TEXT NOT NULL,
            encoding BLOB NOT NULL,
            angle TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS enrollment_sessions (
            session_id TEXT PRIMARY KEY,
            member_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'capturing',
            progress REAL NOT NULL DEFAULT 0,
            quality_score REAL NOT NULL DEFAULT 0,
            liveness_score REAL NOT NULL DEFAULT 0,
            message TEXT NOT NULL DEFAULT '',
            started_at TEXT NOT NULL,
            completed_at TEXT,
            captures_count INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL,
            confidence REAL,
            snapshot TEXT
        );

        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            label TEXT NOT NULL,
            read INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS door_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            locked INTEGER NOT NULL DEFAULT 1
        );

        INSERT OR IGNORE INTO door_state (id, locked) VALUES (1, 1);
    """)
    conn.commit()
    conn.close()


# ── Door helpers ─────────────────────────────────────────────────────────────

def get_door_locked() -> bool:
    conn = get_db()
    row = conn.execute("SELECT locked FROM door_state WHERE id = 1").fetchone()
    conn.close()
    return bool(row["locked"])


def set_door_locked(locked: bool):
    conn = get_db()
    conn.execute("UPDATE door_state SET locked = ? WHERE id = 1", (int(locked),))
    conn.commit()
    conn.close()


# ── Member helpers ───────────────────────────────────────────────────────────

def get_all_members() -> list[dict]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM members ORDER BY added_date DESC").fetchall()
    conn.close()
    return [_member_row_to_dict(r) for r in rows]


def get_member(member_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone()
    conn.close()
    return _member_row_to_dict(row) if row else None


def add_member(name: str, role: str = "Member") -> dict:
    member_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + "Z"
    conn = get_db()
    conn.execute(
        "INSERT INTO members (id, name, role, added_date) VALUES (?, ?, ?, ?)",
        (member_id, name, role, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone()
    conn.close()
    return _member_row_to_dict(row)


def delete_member(member_id: str):
    conn = get_db()
    conn.execute("DELETE FROM members WHERE id = ?", (member_id,))
    conn.commit()
    conn.close()


def update_member_face_enrolled(member_id: str, enrolled: bool, liveness: float = None):
    conn = get_db()
    now = datetime.utcnow().isoformat() + "Z"
    if enrolled:
        conn.execute(
            """UPDATE members
               SET face_enrolled = 1,
                   face_profile_version = face_profile_version + 1,
                   last_enrolled_at = ?,
                   liveness_score = ?
               WHERE id = ?""",
            (now, liveness, member_id),
        )
    else:
        conn.execute(
            """UPDATE members
               SET face_enrolled = 0,
                   face_profile_version = 0,
                   last_enrolled_at = NULL,
                   liveness_score = NULL
               WHERE id = ?""",
            (member_id,),
        )
    conn.commit()
    conn.close()


def _member_row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "role": row["role"],
        "addedDate": row["added_date"],
        "faceEnrolled": bool(row["face_enrolled"]),
        "faceProfileVersion": row["face_profile_version"],
        "lastEnrolledAt": row["last_enrolled_at"],
        "livenessScore": row["liveness_score"],
    }


# ── Enrollment session helpers ───────────────────────────────────────────────

def create_enrollment_session(member_id: str) -> dict:
    session_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + "Z"
    conn = get_db()
    conn.execute(
        """INSERT INTO enrollment_sessions
           (session_id, member_id, status, progress, quality_score, liveness_score, message, started_at)
           VALUES (?, ?, 'capturing', 15, 0.0, 0.0, 'Center your face and look into the camera.', ?)""",
        (session_id, member_id, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM enrollment_sessions WHERE session_id = ?", (session_id,)).fetchone()
    conn.close()
    return _session_row_to_dict(row)


def get_enrollment_session(session_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM enrollment_sessions WHERE session_id = ?", (session_id,)).fetchone()
    conn.close()
    return _session_row_to_dict(row) if row else None


def update_enrollment_session(session_id: str, **kwargs):
    conn = get_db()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [session_id]
    conn.execute(f"UPDATE enrollment_sessions SET {sets} WHERE session_id = ?", vals)
    conn.commit()
    conn.close()


def delete_enrollment_session(session_id: str):
    conn = get_db()
    conn.execute("DELETE FROM enrollment_sessions WHERE session_id = ?", (session_id,))
    conn.commit()
    conn.close()


def _session_row_to_dict(row) -> dict:
    return {
        "sessionId": row["session_id"],
        "memberId": row["member_id"],
        "status": row["status"],
        "progress": row["progress"],
        "qualityScore": row["quality_score"],
        "livenessScore": row["liveness_score"],
        "message": row["message"],
        "startedAt": row["started_at"],
        "completedAt": row["completed_at"],
    }


# ── Face encoding helpers ────────────────────────────────────────────────────

def store_face_encoding(member_id: str, encoding_bytes: bytes, angle: str):
    enc_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + "Z"
    conn = get_db()
    conn.execute(
        "INSERT INTO face_encodings (id, member_id, encoding, angle, created_at) VALUES (?, ?, ?, ?, ?)",
        (enc_id, member_id, encoding_bytes, angle, now),
    )
    conn.commit()
    conn.close()


def get_face_encodings(member_id: str) -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM face_encodings WHERE member_id = ?", (member_id,)
    ).fetchall()
    conn.close()
    return [{"id": r["id"], "member_id": r["member_id"], "encoding": r["encoding"], "angle": r["angle"]} for r in rows]


def get_all_face_encodings() -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        """SELECT fe.encoding, fe.member_id, m.name
           FROM face_encodings fe
           JOIN members m ON fe.member_id = m.id
           WHERE m.face_enrolled = 1"""
    ).fetchall()
    conn.close()
    return [{"encoding": r["encoding"], "member_id": r["member_id"], "name": r["name"]} for r in rows]


def delete_face_encodings(member_id: str):
    conn = get_db()
    conn.execute("DELETE FROM face_encodings WHERE member_id = ?", (member_id,))
    conn.commit()
    conn.close()


# ── Log helpers ──────────────────────────────────────────────────────────────

def add_log(log_type: str, name: str = "", confidence: float = None, snapshot: str = None) -> int:
    now = datetime.utcnow().isoformat() + "Z"
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO logs (type, name, timestamp, confidence, snapshot) VALUES (?, ?, ?, ?, ?)",
        (log_type, name, now, confidence, snapshot),
    )
    log_id = cur.lastrowid
    conn.commit()
    conn.close()
    return log_id


def get_logs(limit: int = 50) -> list[dict]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM logs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [
        {
            "id": r["id"],
            "type": r["type"],
            "name": r["name"],
            "timestamp": r["timestamp"],
            "confidence": r["confidence"],
            "hasSnapshot": r["snapshot"] is not None,
        }
        for r in rows
    ]


def get_log_snapshot(log_id: int) -> Optional[str]:
    conn = get_db()
    row = conn.execute("SELECT snapshot FROM logs WHERE id = ?", (log_id,)).fetchone()
    conn.close()
    if row:
        return row["snapshot"]
    return None


# ── Alert helpers ────────────────────────────────────────────────────────────

def add_alert(label: str):
    now = datetime.utcnow().isoformat() + "Z"
    conn = get_db()
    conn.execute("INSERT INTO alerts (timestamp, label, read) VALUES (?, ?, 0)", (now, label))
    conn.commit()
    conn.close()


def get_alerts() -> list[dict]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM alerts ORDER BY id DESC").fetchall()
    conn.close()
    return [
        {"id": r["id"], "timestamp": r["timestamp"], "label": r["label"], "read": bool(r["read"])}
        for r in rows
    ]


def mark_alert_read(alert_id: int):
    conn = get_db()
    conn.execute("UPDATE alerts SET read = 1 WHERE id = ?", (alert_id,))
    conn.commit()
    conn.close()


def get_stats() -> dict:
    """Aggregate numbers for the mobile dashboard."""
    conn = get_db()

    # Count today's authorized entries
    today = datetime.utcnow().strftime("%Y-%m-%d")
    today_entries = conn.execute(
        "SELECT COUNT(*) FROM logs WHERE type = 'authorized' AND timestamp LIKE ?",
        (f"{today}%",),
    ).fetchone()[0]

    # Unread alert count
    unread_alerts = conn.execute(
        "SELECT COUNT(*) FROM alerts WHERE read = 0",
    ).fetchone()[0]

    # Total active members
    member_count = conn.execute("SELECT COUNT(*) FROM members").fetchone()[0]

    # Most recent authorized entry
    last_entry = conn.execute(
        "SELECT name, timestamp FROM logs WHERE type = 'authorized' ORDER BY id DESC LIMIT 1"
    ).fetchone()

    conn.close()

    return {
        "todayEntries": today_entries,
        "unreadAlerts": unread_alerts,
        "memberCount": member_count,
        "lastEntry": {
            "name": last_entry["name"] if last_entry else None,
            "timestamp": last_entry["timestamp"] if last_entry else None,
        },
    }
