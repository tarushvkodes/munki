"""Notes → Cards fallback extraction (deterministic, labeled fallback):
'Term: definition' lines, 'Q: ... A: ...' pairs, and 'X is Y' sentences."""
import re

def extract_cards(text):
    cards = []
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]
    pending_q = None
    for line in lines:
        m = re.match(r"^Q[:.)]\s*(.+)$", line, re.I)
        if m: pending_q = m.group(1); continue
        m = re.match(r"^A[:.)]\s*(.+)$", line, re.I)
        if m and pending_q:
            cards.append({"front": pending_q, "back": m.group(1), "topic": "Notes"}); pending_q = None; continue
        m = re.match(r"^(.{3,80}?)\s*[:—–]\s+(.{8,})$", line)
        if m and not line.startswith(("http", "- ")):
            term, definition = m.group(1).strip(), m.group(2).strip()
            cards.append({"front": f"What is / when do you use: {term}?", "back": definition, "topic": "Notes"}); continue
        m = re.match(r"^(.{3,60}?)\s+is\s+(.{10,})$", line, re.I)
        if m:
            cards.append({"front": f"What is {m.group(1).strip()}?", "back": f"{m.group(1).strip()} is {m.group(2).strip()}", "topic": "Notes"})
    # dedupe by front
    seen, out = set(), []
    for c in cards:
        k = c["front"].lower()
        if k not in seen: seen.add(k); out.append(c)
    return out
