"""Session State Management with Undo/Redo & History."""

import os
import json
import time
from pathlib import Path
from typing import Dict, Any, List, Optional


class Session:
    """Manages CLI session state, recent command history, and transactional undo/redo."""

    def __init__(self, session_path: Optional[Path] = None):
        self.session_path = session_path or Path.home() / ".cli-anything" / "gta_session.json"
        self.session_path.parent.mkdir(parents=True, exist_ok=True)
        self.history: List[Dict[str, Any]] = []
        self.undo_stack: List[Dict[str, Any]] = []
        self.active_persona: str = "companion"
        self.created_at: float = time.time()
        self.last_updated: float = time.time()
        self.load()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "active_persona": self.active_persona,
            "created_at": self.created_at,
            "last_updated": self.last_updated,
            "history_count": len(self.history),
            "undo_available": len(self.undo_stack) > 0,
            "recent_actions": self.history[-10:],
        }

    def record_action(self, action_name: str, payload: Dict[str, Any], undo_payload: Optional[Dict[str, Any]] = None):
        entry = {
            "action": action_name,
            "payload": payload,
            "timestamp": time.time(),
        }
        self.history.append(entry)
        if undo_payload is not None:
            self.undo_stack.append({
                "action": action_name,
                "undo": undo_payload,
                "timestamp": time.time(),
            })
        self.last_updated = time.time()
        self.save()

    def undo(self) -> Optional[Dict[str, Any]]:
        if not self.undo_stack:
            return None
        item = self.undo_stack.pop()
        self.last_updated = time.time()
        self.save()
        return item

    def save(self):
        try:
            data = {
                "active_persona": self.active_persona,
                "created_at": self.created_at,
                "last_updated": self.last_updated,
                "history": self.history[-50:],
                "undo_stack": self.undo_stack[-20:],
            }
            tmp = self.session_path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp, self.session_path)
        except Exception:
            pass

    def load(self):
        if not self.session_path.exists():
            return
        try:
            with open(self.session_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.active_persona = data.get("active_persona", "companion")
                self.created_at = data.get("created_at", self.created_at)
                self.last_updated = data.get("last_updated", self.last_updated)
                self.history = data.get("history", [])
                self.undo_stack = data.get("undo_stack", [])
        except Exception:
            pass
