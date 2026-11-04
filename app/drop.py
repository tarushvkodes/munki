"""Munki Drop: paste notes or drop a .pdf/.txt/.md file and get a
deduplicated, topic-tagged deck at the front of the feed.

ingest (bytes -> text, page-aware cleanup) -> parse (typed lines) ->
RULES (the card rule table, run under a heading tracker that supplies
each card's topic) -> dedupe against every deck. The Meta path replaces
only the rule table: titles, dedupe, and source labels are shared, and
any Meta failure falls back to the rules, labeled source='fallback'."""
import io, math, os, re
from collections import Counter
from dataclasses import dataclass
from typing import Callable

from pypdf import PdfReader

from . import db, meta_client, srs

MAX_FILE_BYTES = 15 * 1024 * 1024
MAX_CHARS = 200_000
MAX_CARDS = 150
MAX_BACK = 300
META_CHUNK_CHARS = 6000
META_MAX_CHUNKS = 3
FILE_TYPES = (".pdf", ".txt", ".md", ".markdown")
SOURCE_LABELS = {"fallback": "Built-in extractor (offline)", "meta-api": "Meta AI (muse-spark)"}
KINDS = ("definition", "term", "formula", "qa", "list", "statement")
LIST_INTRO = 9  # heading level of an "X:" line that opens a bullet list; its topic ends with the list

NOTE_EMPTY = ("No study cards found. Munki Drop reads lines like \"Term: definition\", \"X is a Y\", "
              "\"Q: ... A: ...\", formulas like \"p = mv (momentum)\", and short headings followed by bullet points.")
NOTE_SCANNED = ("This PDF has no selectable text (it looks scanned), so there was nothing to read. "
                "Export it with text, or paste the notes instead.")
NOTE_META_FAILED = "Meta AI didn't come through, so Munki's built-in extractor made these cards."
NOTE_META_PARTIAL = f"Meta AI read the first {META_CHUNK_CHARS * META_MAX_CHUNKS:,} characters of this one."
NOTE_TRUNCATED = f"This one is long, so Munki read the first {MAX_CHARS:,} characters."
NOTE_CAPPED = f"Munki kept the first {MAX_CARDS} cards. Drop the rest as a second import."
TOO_LARGE = "That file is over 15 MB. Try a smaller file, or paste the notes instead."


# ---------- data shapes ----------
@dataclass(frozen=True)
class DropCard:
    front: str
    back: str
    topic: str
    kind: str  # one of KINDS


@dataclass(frozen=True)
class Line:
    kind: str  # "heading" | "bullet" | "text"
    text: str
    level: int = 0  # heading depth (1 = biggest); LIST_INTRO for an "X:" list opener
    topic: str = ""  # headings only: the subject without "Lecture 5:" or "2.1" prefixes


@dataclass(frozen=True)
class Ingested:
    text: str
    pages: int | None
    name: str | None
    notes: tuple[str, ...] = ()


@dataclass(frozen=True)
class Draft:
    source: str
    cards: list[DropCard]
    heading: str | None
    notes: tuple[str, ...] = ()


class DropError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status, self.message = status, message


# ---------- ingestion ----------
def ingest(text=None, filename=None, data=None):
    has_text = bool(text and text.strip())
    if has_text and filename:
        raise DropError(400, "Send pasted text or one file, not both.")
    if not has_text and not filename:
        raise DropError(400, "Paste some notes or drop a file to get started.")
    if has_text:
        return _capped(text, None, None)
    stem, ext = os.path.splitext(os.path.basename(filename))
    if ext.lower() not in FILE_TYPES:
        raise DropError(415, "Munki Drop reads .pdf, .txt, and .md files. For anything else, paste the text.")
    if len(data or b"") > MAX_FILE_BYTES:
        raise DropError(413, TOO_LARGE)
    if not data:
        raise DropError(400, "That file is empty. Drop one with some notes in it.")
    if ext.lower() == ".pdf":
        return _read_pdf(data, stem.strip() or None)
    return _capped(_decode(data), None, stem.strip() or None)


def _capped(text, pages, name, notes=()):
    if len(text) <= MAX_CHARS:
        return Ingested(text, pages, name, tuple(notes))
    cut = text.rfind("\n", 0, MAX_CHARS)
    return Ingested(text[:cut if cut > 0 else MAX_CHARS], pages, name, (*notes, NOTE_TRUNCATED))


def _decode(data):
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16", errors="replace")
    if b"\x00" in data[:4096]:
        raise DropError(400, "That file doesn't look like text. Paste the notes instead.")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")


def _read_pdf(data, name):
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise DropError(400, "This PDF is password-protected. Remove the password and drop it again.")
        pages, read = [], 0
        for page in reader.pages:
            if read > MAX_CHARS:
                break
            pages.append(page.extract_text() or "")
            read += len(pages[-1])
        count = len(reader.pages)
    except DropError:
        raise
    except Exception as exc:  # pypdf raises many types on damaged input; the user gets a sentence, never a 500
        raise DropError(400, "Munki couldn't read this PDF. It may be damaged: re-save it, or paste the text instead.") from exc
    text = "\n".join(strip_running_lines(pages))
    notes = () if text.strip() else (NOTE_SCANNED,)
    return _capped(text, count, name, notes)


_PAGE_TOKEN = r"(?:page\s*|p\.\s*)?\d{1,4}(?:\s*(?:of|/)\s*\d{1,4})?"


def _shape(line):
    """A line with any page number at its start or end removed, for header/footer matching."""
    s = re.sub(r"\s+", " ", line.strip().lower())
    s = re.sub(rf"^{_PAGE_TOKEN}\s*[|·•\-–—]?\s*", "", s)
    return re.sub(rf"\s*[|·•\-–—]?\s*{_PAGE_TOKEN}$", "", s)


def strip_running_lines(pages, edge=3):
    """Drop header/footer lines that recur at the top or bottom of most pages."""
    split = [p.splitlines() for p in pages]
    if len(split) < 2:
        return pages

    def edges(lines):
        filled = [i for i, l in enumerate(lines) if l.strip()]
        return set(filled[:edge] + filled[-edge:])

    seen = Counter()
    for lines in split:
        seen.update({_shape(lines[i]) for i in edges(lines)})
    need = max(2, math.ceil(0.6 * len(split)))
    running = {s for s, n in seen.items() if n >= need and s}
    return ["\n".join(l for i, l in enumerate(lines) if not (i in edges(lines) and _shape(l) in running))
            for lines in split]


# ---------- cleanup + parsing ----------
_LIGATURES = str.maketrans({"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st",
                            "­": "", "​": "", "﻿": "", " ": " ", "\t": " ",
                            "\f": "\n", "\r": "\n", "’": "'", "‘": "'"})
_BULLET = re.compile(r"^(?:[•▪◦●○■□‣⁃∙·➢►✓❖*+\-–]|\d{1,2}[.)]|[a-z]\)|\([a-z0-9]{1,3}\))\s+(?=\S)")
_SETEXT = re.compile(r"^(?:=+|-{3,})$")
_NOISE = (re.compile(r"^(?:page\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?(?:\s*(?:of|/)\s*\d{1,4})?$", re.I),
          re.compile(r"^(?:<?https?://|www\.)\S+>?$", re.I))
_PREFIX = r"(?:lecture|chapter|unit|week|module|part|section|lesson|topic)\s+[\dIVXLC]+[A-Za-z]?"
_SUBJECT = re.compile(rf"^(?:{_PREFIX}|\d+(?:\.\d+)*\.?)(?:\s*[:.|\-–—]\s*|\s+)(\S.*)$", re.I)
_ALLCAPS = re.compile(r"^[A-Z0-9][A-Z0-9 &/,'()\-–—]*:?$")


def _heading_style(s, after_question=False):
    """(level, text) when s reads as a heading, else None."""
    m = re.match(r"^(#{1,6})\s+(.+?)[\s#]*$", s)
    if m:
        return len(m[1]), m[2]
    words = len(s.split())
    if words <= 10 and re.match(rf"^{_PREFIX}\b(?:\s*[:.|\-–—]\s*[^.!?=]+)?$", s, re.I):
        return 1, s
    m = re.match(r"^(\d+(?:\.\d+)+)\.?\s+([A-Z][^.!?=]*)$", s)
    if m and words <= 9:
        return m[1].count(".") + 2, s
    if not after_question and _ALLCAPS.match(s) and words <= 6 and len(re.findall(r"[A-Z]", s)) >= 3:
        return 2, s
    return None


def _heading(text, level):
    text = text.strip().rstrip(":").strip()
    m = _SUBJECT.match(text)
    return Line("heading", text, level, (m[1] if m else text).strip())


def _classify(s, prev):
    m = _BULLET.match(s)
    if m:
        return Line("bullet", s[m.end():])
    style = _heading_style(s, after_question=prev is not None and prev.text.endswith("?"))
    return _heading(style[1], style[0]) if style else Line("text", s)


def normalize(text):
    text = text.replace("\r\n", "\n").translate(_LIGATURES)
    text = re.sub(r"(?<=[^\W\d_])-[ ]*\n[ ]*(?=[a-z])", "", text)
    text = re.sub(r"\*\*(.+?)\*\*|__(.+?)__", lambda m: m[1] or m[2], text)
    text = re.sub(r"`([^`\n]+)`", r"\1", text)
    return re.sub(r"!?\[([^\]\n]+)\]\([^)\n]*\)", r"\1", text)


def _is_noise(s):
    return any(p.match(s) for p in _NOISE) or not re.search(r"[^\W\d_]{2}", s)


_CONNECTORS = frozenset("and or of the a an to with for in on by that which is are as at from into than when "
                        "where if its their this these whose while but nor".split())
_Q_PREFIX = re.compile(r"^(?i:q|question)\s*\d*\s*[:.)]\s*(?P<q>\S.*)$")
_A_PREFIX = re.compile(r"^(?i:a|ans|answer)\s*[:.)]\s*(?P<a>\S.*)$")


def _continues(prev, line):
    """True when `line` is the wrapped tail of `prev` (PDF line breaks, pasted wraps)."""
    if prev is None or line.kind != "text" or prev.kind == "heading":
        return False
    if "=" in prev.text or "=" in line.text or _Q_PREFIX.match(line.text) or _A_PREFIX.match(line.text):
        return False
    if prev.text.endswith(":"):
        return prev.kind == "text" and len(prev.text.split()) <= 6
    if prev.text[-1] in ".?!;":
        return False
    return line.text[0].islower() or prev.text.endswith(",") or prev.text.split()[-1].lower() in _CONNECTORS


def parse(text):
    """Typed, non-blank lines with wraps rejoined and list openers marked."""
    lines = []  # None marks a blank line: a paragraph break nothing joins across
    for s in (re.sub(r"\s+", " ", raw).strip() for raw in normalize(text).split("\n")):
        prev = lines[-1] if lines else None
        if s and _SETEXT.match(s) and prev is not None and prev.kind == "text":
            lines[-1] = _heading(prev.text, 1 if s[0] == "=" else 2)
        elif not s or _is_noise(s):
            lines.append(None)
        else:
            lines.append(_classify(s, prev))
    nxt = None
    for k in range(len(lines) - 1, -1, -1):
        line = lines[k]
        if line is None:
            continue
        if (nxt is not None and nxt.kind == "bullet" and line.kind == "text"
                and line.text.endswith(":") and len(line.text.split()) <= 8):
            lines[k] = _heading(line.text, LIST_INTRO)
        nxt = lines[k]
    out = []
    for line in lines:
        if line is not None and _continues(out[-1] if out else None, line):
            out[-1] = Line(out[-1].kind, f"{out[-1].text} {line.text}")
        else:
            out.append(line)
    return [l for l in out if l is not None]


# ---------- phrasing helpers ----------
_FILLER = frozenset(
    "it this that there these those he she we they here you i which what who why how when where if so and but "
    "also because since then thus hence now one each note example examples e.g i.e eg ie see definition answer "
    "question summary overview topic subject lecture chapter unit week section agenda objective objectives goal "
    "goals reminder in on for to with by at as from after before during while about".split())
_VERBS = frozenset("is are was were be been being has have had will would can could should may might must do does did".split())
_NAMED_HEADS = frozenset("test theorem law rule principle method formula equation model cycle effect series criterion "
                         "postulate lemma property approach algorithm".split())
_NOT_PLURAL = frozenset("series species means news physics mathematics economics ethics statistics".split())
_ARTICLE = re.compile(r"^(?:a|an|the)\s", re.I)
_MASS_SUFFIXES = ("tion", "sion", "ity", "ness", "ism", "ance", "ence", "ment", "ics", "ing", "acy", "ogy", "ship")


def _ok_subject(s, max_words=6):
    words = s.split()
    return (1 <= len(words) <= max_words and words[0].lower() not in _FILLER and "," not in s
            and not s.endswith("?") and not any(w.lower() in _VERBS for w in words)
            and bool(re.search(r"[^\W\d_]", s)))


def _natural(term):
    """Sentence-case a leading capital ('Foreign key' -> 'foreign key'); keep acronyms and names."""
    words = term.split()
    first = words[0]
    if (first[:1].isupper() and first[1:] == first[1:].lower() and not first.endswith("'s")
            and not any(ch.isdigit() for ch in first) and not any(w[:1].isupper() for w in words[1:])):
        words[0] = first.lower()
    return " ".join(words)


def _is_plural(term):
    last = term.split()[-1].lower()
    return (len(last) > 3 and last.endswith("s") and last not in _NOT_PLURAL
            and not last.endswith(("ss", "us", "is", "ics", "as", "'s")))


def _the(term):
    return term if _ARTICLE.match(term) or any(ch.isdigit() for ch in term) else f"the {term}"


def _noun(term):
    t = _natural(term)
    return f"the {t}" if not _ARTICLE.match(t) and t.split()[-1].lower() in _NAMED_HEADS else t


def _indefinite(term):
    first, word = term[0], term.split()[0]
    vowel = first in "AEFHILMNORSX" if word.isupper() and len(word) <= 3 else first.lower() in "aeiou"
    return f"{'an' if vowel else 'a'} {term}"


def _cap(s):
    first = s.split(" ", 1)[0]
    return s[0].upper() + s[1:] if first.isalpha() and first.islower() else s


def _what(term, body=""):
    t = _natural(term)
    if _is_plural(t):
        return f"What are {t}?"
    countable = not t.split()[-1].lower().endswith(_MASS_SUFFIXES)
    if not _ARTICLE.match(t) and countable and (re.match(r"(?i)an?\s", body) or (t.isupper() and len(t.split()) > 1)):
        return f"What is {_indefinite(t)}?"
    return f"What is {_noun(t)}?"


_USAGE = re.compile(r"(?i)^(?:use|used|apply|applied|best)\s+(?:it\s+|this\s+)?(?:when|for|to|if|on|with)\b")
_PERSON = re.compile(r"(?i)^(?:dr|prof|professor|mr|mrs|ms|mx)\.?\s|[\w.+-]+@[\w-]+\.\w")
_WHEN = re.compile(r"(?i)\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b"
                   r"|\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?s?\b"
                   r"|\b\d{1,2}/\d{1,2}\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b")
def _names_something(body):
    words = re.findall(r"[^\W\d_][\w'&-]*", body)
    return len(words) >= 2 and sum(w[0].isupper() for w in words) >= 0.6 * len(words)


_TERM_FRONTS = (  # the back's shape picks the question word
    (lambda body: _USAGE.match(body), lambda t: f"When do you use {_the(t)}?"),
    (lambda body: _PERSON.search(body), lambda t: f"Who {'are' if _is_plural(t) else 'is'} {_the(t)}?"),
    (lambda body: len(body.split()) <= 12 and _WHEN.search(body),
     lambda t: f"When {'are' if _is_plural(t) else 'is'} {_the(t)}?"),
    (_names_something, lambda t: f"What {'are' if _is_plural(t) else 'is'} {_the(t)}?"),
)


def _term_front(term, body):
    t = _natural(term)
    for shape, front in _TERM_FRONTS:
        if shape(body):
            return front(t)
    return _what(t, body)


# ---------- the card rule table ----------
@dataclass(frozen=True)
class Rule:
    kind: str
    on: frozenset  # line kinds the matcher looks at
    match: Callable  # (lines, i) -> (fields, lines consumed) | None
    build: Callable  # (fields, topic) -> (front, back)


TEXTISH = frozenset({"text", "bullet"})
_Q = r"(?i:q|question)\s*\d*\s*[:.)]\s*"
_QA_INLINE = re.compile(rf"^{_Q}(?P<q>.+?\?)\s*(?:A|Ans|Answer)\s*[:.)]\s*(?P<a>\S.*)$")
_GLOSSARY = re.compile(r"^(?P<term>[^:]{1,60}?)(?::\s+|\s+[-–—]\s+|\s*—\s*)(?P<body>\S.*)$")
_SENTENCE_DEFS = (
    (re.compile(r"^(?P<subj>.+?)\s+(?:is|are)\s+defined\s+as\s+(?P<body>.+)$", re.I), "is"),
    (re.compile(r"^(?P<subj>.+?)\s+refers?\s+to\s+(?P<body>.+)$", re.I), "refer"),
    (re.compile(r"^(?P<subj>.+?)\s+means\s+(?P<body>.+)$", re.I), "mean"),
    (re.compile(r"^(?P<subj>.+?)\s+is\s+(?P<body>(?:a|an|the)\s.+)$", re.I), "is"),
    (re.compile(r"^(?P<subj>.+?)\s+are\s+(?P<body>.+)$", re.I), "are"),
)
_FORMULA_NAMED = re.compile(r"^(?P<name>[^:=()]{2,60}?)(?::\s*|\s+[-–—]\s+)(?P<f>[^=]+=.+)$")
_FORMULA_PAREN = re.compile(r"^(?P<f>[^=()]+=[^()]+?)\s*\((?P<name>[^()=]{2,50})\)\.?$")
_SYMBOL = re.compile(r"^[^\W\d_][\w'^{}\[\]./]{0,7}$")
_WEIGHT = re.compile(r"^(?P<label>[^\W\d_][^%:=]{1,40}?)\s*(?::|\s[-–—]|\()?\s*(?P<pct>\d{1,3}(?:\.\d+)?)\s*%\)?(?P<rest>(?:\s+of\s+(?:the\s+|your\s+)?(?:final\s+|course\s+)?grade)?)\.?$", re.I)
_CUED = re.compile(r"^(?P<cue>key idea|key point|big idea|main idea|remember|note|important|tip|trap|common mistake"
                   r"|warning|caution|rule of thumb|takeaway|nb)\s*[:!\-–—]\s*(?P<s>\S.+)$", re.I)
_CUE_FRONTS = {"trap": "What's the trap with {}?", "common mistake": "What's the common mistake with {}?",
               "warning": "What's the warning about {}?", "caution": "What's the warning about {}?",
               "tip": "What's a tip for {}?", "rule of thumb": "What's the rule of thumb for {}?"}
_RULE_WORDS = re.compile(r"(?i)\b(?:always|never|only if|if and only if|must|cannot|can't)\b")
_LIST_HEADS = re.compile(r"(?i)^(?:types|kinds|steps|parts|ways|stages|phases|forms|causes|properties|rules|"
                         r"advantages|disadvantages|pros|cons|examples|components)\b")


def _next(lines, i):
    return lines[i + 1] if i + 1 < len(lines) else None


def _match_qa_inline(lines, i):
    m = _QA_INLINE.match(lines[i].text)
    return ({"q": m["q"], "a": m["a"]}, 1) if m else None


def _match_qa_prefixed(lines, i):
    m, nxt = _Q_PREFIX.match(lines[i].text), _next(lines, i)
    if not m or nxt is None or nxt.kind != "text" or _Q_PREFIX.match(nxt.text):
        return None
    a = _A_PREFIX.match(nxt.text)
    return {"q": m["q"], "a": a["a"] if a else nxt.text}, 2


def _match_question(lines, i):
    s, nxt = lines[i].text, _next(lines, i)
    if (not s.endswith("?") or nxt is None or nxt.kind != "text" or nxt.text.endswith("?")
            or _Q_PREFIX.match(nxt.text)):
        return None
    a = _A_PREFIX.match(nxt.text)
    return {"q": s, "a": a["a"] if a else nxt.text}, 2


def _build_qa(g, topic):
    return g["q"], _cap(g["a"])


def _match_list(lines, i):
    intro = lines[i]
    if intro.kind == "text" and not intro.text.endswith("?"):
        return None
    j = i + 1
    while j < len(lines) and lines[j].kind == "bullet":
        j += 1
    items = [l.text for l in lines[i + 1:j]]
    return ({"intro": intro, "items": items}, 1) if 2 <= len(items) <= 8 else None


def _list_item(bullet):
    m = _GLOSSARY.match(bullet)
    return m["term"].strip() if m and _ok_subject(m["term"].strip()) else bullet


def _build_list(g, topic):
    intro, items = g["intro"], g["items"]
    if intro.kind == "text":
        q = _Q_PREFIX.match(intro.text)
        front = q["q"] if q else intro.text
    else:
        subject = _natural(intro.topic)
        if all("%" in item for item in items):
            front = f"What's the breakdown of {subject}?"
        elif _is_plural(subject) or _LIST_HEADS.match(subject):
            front = f"What are the {subject}?"
        else:
            front = f"What are the key points about {subject}?"
    back = "\n".join(f"• {item}" for item in items)
    return front, back if len(back) <= MAX_BACK else "\n".join(f"• {_list_item(item)}" for item in items)


def _ok_name(name):
    return _ok_subject(name) and bool(re.fullmatch(r"[^\W\d_][\w '\-]*", name))


def _match_formula(lines, i):
    s = lines[i].text
    if "=" not in s or re.search(r"[<>!=]=|=>", s) or len(s) > 160:
        return None
    for pattern in (_FORMULA_NAMED, _FORMULA_PAREN):
        m = pattern.match(s)
        if m and _ok_name(m["name"].strip()):
            return {"name": m["name"].strip(), "f": m["f"].strip()}, 1
    lhs, rhs = (part.strip() for part in s.split("=", 1))
    tokens = lhs.split()
    if not tokens or not re.search(r"[^\W\d_]", rhs):
        return None
    symbol = tokens[-1] if _is_symbol(tokens[-1]) else None
    name = " ".join(tokens[:-1] if symbol else tokens)
    name = _ARTICLE.sub("", re.sub(r"(?i)\s+(?:is|equals|is given by)$", "", name)).strip()
    if name:
        return ({"name": name, "f": f"{symbol} = {rhs}" if symbol else s}, 1) if _ok_name(name) else None
    return ({"name": symbol, "f": s, "symbol": True}, 1) if symbol else None


def _is_symbol(token):
    return bool(_SYMBOL.match(token)) and (len(token) <= 3 or not token.isalpha())


def _build_formula(g, topic):
    name = g["name"] if g.get("symbol") else _noun(g["name"])
    return f"What's the formula for {name}?", re.sub(r"\s*=\s*", " = ", g["f"])


def _match_weight(lines, i):
    m = _WEIGHT.match(lines[i].text)
    return ({"label": m["label"].strip(" -–—("), "pct": m["pct"], "rest": m["rest"].rstrip(" .")}, 1)\
        if m and _ok_subject(m["label"].strip(" -–—(")) else None


def _build_weight(g, topic):
    label = _natural(g["label"])
    return f"How much {'are' if _is_plural(label) else 'is'} {_the(label)} worth?", f"{g['pct']}%{g['rest']}"


def _match_cued(lines, i):
    m = _CUED.match(lines[i].text)
    return ({"cue": m["cue"].lower(), "s": m["s"]}, 1) if m else None


def _match_rule_sentence(lines, i):
    s = lines[i].text
    ok = _RULE_WORDS.search(s) and len(s.split()) >= 6 and (s.endswith(".") or lines[i].kind == "bullet")
    return ({"cue": None, "s": s}, 1) if ok else None


def _build_statement(g, topic):
    sentence = _cap(g["s"])
    words = sentence.rstrip(".").split()
    if len(words) < 6:
        template = _CUE_FRONTS.get(g["cue"], "What's the key idea about {}?")
        return template.format(_natural(topic)), sentence
    cut = max(3, min(len(words) - 2, int(len(words) * 0.45 + 0.5)))
    return f"Finish the idea: {' '.join(words[:cut])} …", sentence


def _match_glossary(lines, i):
    m = _GLOSSARY.match(lines[i].text)
    if not m or not _ok_subject(m["term"].strip()) or m["body"].startswith(("http://", "https://", "www.")):
        return None
    return {"term": m["term"].strip(), "body": m["body"]}, 1


def _build_term(g, topic):
    return _term_front(g["term"], g["body"]), _cap(g["body"])


def _match_sentence_definition(lines, i):
    s = lines[i].text
    for pattern, verb in _SENTENCE_DEFS:
        m = pattern.match(s)
        if m and _ok_subject(m["subj"]) and len(m["body"].split()) >= 2:
            return {"subj": m["subj"], "verb": verb, "body": m["body"]}, 1
    return None


def _build_definition(g, topic):
    subj = _natural(g["subj"])
    if _ARTICLE.match(subj):
        subj = subj[0].lower() + subj[1:]
    front = {"refer": f"What does {subj} refer to?", "mean": f"What does {subj} mean?",
             "are": f"What are {subj}?"}.get(g["verb"], f"What is {subj}?")
    return front, _cap(g["body"])


RULES = (  # first match wins; order encodes precedence between overlapping shapes
    Rule("qa", TEXTISH, _match_qa_inline, _build_qa),
    Rule("qa", TEXTISH, _match_qa_prefixed, _build_qa),
    Rule("list", frozenset({"heading", "text"}), _match_list, _build_list),
    Rule("qa", TEXTISH, _match_question, _build_qa),
    Rule("formula", TEXTISH, _match_formula, _build_formula),
    Rule("term", TEXTISH, _match_weight, _build_weight),
    Rule("statement", TEXTISH, _match_cued, _build_statement),
    Rule("term", TEXTISH, _match_glossary, _build_term),
    Rule("definition", TEXTISH, _match_sentence_definition, _build_definition),
    Rule("statement", TEXTISH, _match_rule_sentence, _build_statement),
)


# ---------- extraction ----------
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")
_URL_ONLY = re.compile(r"^(?:<?https?://|www\.)\S+>?$", re.I)


def _trim(back):
    if len(back) <= MAX_BACK:
        return back
    cut = back[:MAX_BACK]
    end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "), cut.rfind("\n"))
    if end >= MAX_BACK // 3:
        return cut[:end + 1].rstrip()
    return cut[:cut.rfind(" ")].rstrip(" ,;:") + " …"


def _finish(kind, front, back, topic):
    front = re.sub(r"\s+", " ", front).strip()
    back = _trim("\n".join(re.sub(r"[ \t]+", " ", l).strip() for l in back.strip().splitlines()))
    if len(re.findall(r"[^\W_]", front)) < 6 or len(front.split()) < 2 or len(front) > 200:
        return None
    if len(re.findall(r"[^\W_]", back)) < (1 if kind == "qa" else 2) or _URL_ONLY.match(back):
        return None
    if db.front_key(front) == db.front_key(back):
        return None
    return DropCard(front, back, topic.strip() or "General", kind)


def cards_from_lines(lines, default_topic="General", limit=MAX_CARDS):
    lines, cards, headings = list(lines), [], []  # headings: (level, topic) stack
    i = 0
    while i < len(lines) and len(cards) < limit:
        line = lines[i]
        if headings and headings[-1][0] == LIST_INTRO and line.kind != "bullet":
            headings.pop()
        if line.kind == "heading":
            while headings and headings[-1][0] >= line.level:
                headings.pop()
            headings.append((line.level, line.topic))
        topic = headings[-1][1] if headings else default_topic
        hit = next(((rule, found) for rule in RULES if line.kind in rule.on
                    for found in [rule.match(lines, i)] if found), None)
        if hit:
            rule, (fields, span) = hit
            card = _finish(rule.kind, *rule.build(fields, topic), topic)
            if card:
                cards.append(card)
            i += span
            continue
        sentences = _SENTENCE_END.split(line.text) if line.kind == "text" else []
        if len(sentences) > 1:
            lines[i:i + 1] = [Line("text", s) for s in sentences]
            continue
        i += 1
    return cards


def extract(text, default_topic="General"):
    """Deterministic cards for `text` (the offline extractor)."""
    return cards_from_lines(parse(text), default_topic)


# ---------- dedupe ----------
_LOOSE_LEAD = re.compile(r"^(?:what\s+is|what's|whats|what\s+are|define)\s+(?:(?:a|an|the)\s+)?")


def loose_key(front):
    return re.sub(r"[^a-z0-9]", "", _LOOSE_LEAD.sub("", front.strip().lower().replace("’", "'")))


def _keys(front):
    loose = loose_key(front)
    return [("strict", db.front_key(front))] + ([("loose", loose)] if loose else [])


def existing_index():
    """Dedupe keys of every card in every deck -> the deck holding it."""
    index = {}
    for front, deck_id in db.card_fronts():
        for key in _keys(front):
            index.setdefault(key, deck_id)
    return index


def duplicate_flags(fronts, index):
    seen, flags = set(), []
    for front in fronts:
        keys = _keys(front)
        flags.append(any(k in index or k in seen for k in keys))
        seen.update(keys)
    return flags


# ---------- drafting (Meta or rules) ----------
def _chunks(text, size=META_CHUNK_CHARS):
    chunks, current, used = [], [], 0
    for line in text.splitlines():
        for piece in (line[k:k + size] for k in range(0, max(len(line), 1), size)):
            if current and used + len(piece) > size:
                chunks.append("\n".join(current))
                current, used = [], 0
            current.append(piece)
            used += len(piece) + 1
    if current:
        chunks.append("\n".join(current))
    return [c for c in chunks if c.strip()]


def _meta_cards(text, default_topic):
    chunks = _chunks(normalize(text))
    cards = []
    for chunk in chunks[:META_MAX_CHUNKS]:
        for c in meta_client.generate_cards(chunk):
            card = _finish("qa", c["front"], c["back"], c.get("topic") or default_topic)
            if card:
                cards.append(card)
    if not cards:
        raise ValueError("Meta returned no usable cards")
    return cards, (NOTE_META_PARTIAL,) if len(chunks) > META_MAX_CHUNKS else ()


def draft(text, default_topic="General"):
    lines = parse(text)
    heading = next((l.text for l in lines if l.kind == "heading" and l.level != LIST_INTRO), None)
    notes = ()
    if text.strip() and meta_client.available():
        try:
            cards, notes = _meta_cards(text, default_topic)
            return Draft("meta-api", cards[:MAX_CARDS], heading, notes + ((NOTE_CAPPED,) if len(cards) > MAX_CARDS else ()))
        except Exception:  # any network, model, or shape failure: the labeled offline extractor takes over
            notes = (NOTE_META_FAILED,)
    cards = cards_from_lines(lines, default_topic, limit=MAX_CARDS + 1)
    if len(cards) > MAX_CARDS:
        cards, notes = cards[:MAX_CARDS], notes + (NOTE_CAPPED,)
    return Draft("fallback", cards, heading, notes)


def preview(text=None, filename=None, data=None, title=None):
    src = ingest(text, filename, data)
    title = (title or "").strip()
    d = draft(src.text, default_topic=title or "General")
    flags = duplicate_flags([c.front for c in d.cards], existing_index())
    notes = list(src.notes) + list(d.notes)
    if not d.cards and NOTE_SCANNED not in notes:
        notes.append(NOTE_EMPTY)
    dups = sum(flags)
    return {"source": d.source, "source_label": SOURCE_LABELS[d.source],
            "title": title or d.heading or src.name or "Pasted notes",
            "topics": list(dict.fromkeys(c.topic for c in d.cards)),
            "cards": [{"front": c.front, "back": c.back, "topic": c.topic, "kind": c.kind, "duplicate": dup}
                      for c, dup in zip(d.cards, flags)],
            "stats": {"extracted": len(d.cards), "duplicates": dups, "new": len(d.cards) - dups,
                      "pages": src.pages, "chars": len(src.text)},
            "note": " ".join(notes) or None}


# ---------- commit ----------
def _slugify(title):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40].strip("-") or "notes"


def _new_deck(title, source):
    taken = {d["slug"] for d in db.list_decks()}
    base = f"drop-{_slugify(title)}"
    slug = next(s for s in (base if n == 1 else f"{base}-{n}" for n in range(1, len(taken) + 2)) if s not in taken)
    label = SOURCE_LABELS.get(source, SOURCE_LABELS["fallback"])
    return db.get_deck(deck_id=db.create_deck(slug, title[:80], f"Made with Munki Drop ({label})."))


def commit(cards, title, deck_slug, source, today):
    """Add the non-duplicate cards; returns (deck, new card ids, skipped duplicates).
    Re-running with the same cards adds nothing: every card is then a duplicate."""
    rows = [(f.strip(), b.strip(), (t or "").strip() or "General") for f, b, t in cards if f.strip() and b.strip()]
    if not rows:
        raise DropError(400, "There are no cards to add yet.")
    index = existing_index()
    fresh = [row for row, dup in zip(rows, duplicate_flags([r[0] for r in rows], index)) if not dup]
    deck = db.get_deck(slug=deck_slug) if deck_slug else None
    if deck is None and not fresh:
        deck = db.get_deck(deck_id=next(index[k] for k in _keys(rows[0][0]) if k in index))
    if deck is None:
        deck = _new_deck((title or "").strip() or "Pasted notes", source)
    ids = db.add_cards(deck["id"], fresh, "drop", srs.new_state(today)) if fresh else []
    return deck, ids, len(rows) - len(ids)
