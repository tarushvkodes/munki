import io

import pytest
from pypdf import PdfReader, PdfWriter

from app import drop, meta_client
from pdf_fixture import make_pdf

LECTURE = """# Lecture 12 — Joins and Normalization
CNIT 182 · Prof. Rivera · Nov 4

## Keys
A primary key is a column (or set of columns) that uniquely identifies each row.
Foreign key: a column that points at the primary key of another table.
**Composite key** — a primary key made of two or more columns
Referential integrity refers to every foreign key value matching a real row.
Remember: every table must have a primary key that never repeats.

## Joins
Types of joins:
- INNER JOIN: only rows with a match in both tables
- LEFT JOIN: every row from the left table, plus matches from the right
- RIGHT JOIN: every row from the right table, plus matches from the left
- FULL OUTER JOIN: every row from both tables

Q: Which join keeps customers who never placed an order?
A: LEFT JOIN from customers to orders.
What happens to unmatched rows in an INNER JOIN?
They are dropped from the result.
A join without an ON condition produces a Cartesian product, so always write the join condition.

## Normalization
Normalization is the process of organizing tables to reduce redundancy and update anomalies.
1NF means every column holds a single, atomic value.
2NF - 1NF plus no partial dependency on part of a composite key
3NF: 2NF plus no transitive dependencies between non-key columns.
Trap: denormalizing too early

## Query cost
Rows scanned = rows in table × fraction not filtered by an index
Selectivity = matching rows / total rows (lower is better)

## Practice
Question: Why does a LEFT JOIN sometimes return NULLs? Answer: Right-side columns are NULL when no row matches.
Check your understanding (https://example.edu/cnit182/quiz12)
"""

SYLLABUS = """CNIT 182: Database Fundamentals
Fall 2026 · Purdue University · 3 credits

Instructor: Dr. Maya Rivera (mrivera@purdue.edu)
TA: Sam Chen (chen512@purdue.edu)
Office hours: Tue 3:00-4:30pm, KNOY 241
Lectures: Mon/Wed/Fri 10:30am, LWSN B155
Textbook: Database Systems: Design, Implementation, and Management (14th ed.)
Prerequisites: CNIT 155 or CS 159
Course website: https://purdue.brightspace.com/d2l/home/12345

Grading:
- Exams 40%
- Labs 25%
- Project 25%
- Participation 10%

Important dates:
- Exam 1: Sep 30
- Exam 2: Oct 28
- Final exam: Dec 14, 8:00am

Late work loses 10% per day and is never accepted after 3 days.
Attendance is required for all lab sections.
Academic integrity: submitting someone else's SQL as your own is a violation.
"""

FOOTER = "CNIT 182 · Fall 2026 · Purdue University"
PDF_PAGES = [
    "Lecture 12 — Joins\nA foreign key is a column that refer-\nences the primary key of another table.\n"
    f"Index: a structure that speeds up lookups on a column.\n{FOOTER}\nPage 1 of 3",
    "Types of joins:\n• INNER JOIN: only rows that match in both tables\n• LEFT JOIN: every row from the left table\n"
    f"Selectivity = matching rows / total rows\n{FOOTER}\nPage 2 of 3",
    "Q: Which join keeps unmatched left rows?\nA: LEFT JOIN\nA view is a saved query that\n"
    f"behaves like a table.\n{FOOTER}\nPage 3 of 3",
]


def pairs(text):
    return [(c.front, c.back) for c in drop.extract(text)]


def card(text, front):
    return next(c for c in drop.extract(text) if c.front == front)


def preview(client, **fields):
    files = fields.pop("files", None)
    return client.post("/api/drop/preview", data=fields, files=files)


def locked_copy(pdf, user_password):
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(pdf)))
    writer.encrypt(user_password=user_password, owner_password="owner", algorithm="RC4-128")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def test_headings_set_topic_and_make_no_cards():
    text = """# Lecture 12 — Joins
Primary key: a column that uniquely identifies each row.
## Normalization
Normalization refers to organizing tables to reduce redundancy.
Physics Review
==============
Impulse: the change in momentum caused by a force over time.
Lecture 5: Momentum
Momentum is the product of mass and velocity.
Chapter 3 — Series
A geometric series is a series with a constant ratio between terms.
2.1 Energy
Kinetic energy is the energy an object has because of its motion.
KEY TERMS
Inertia: resistance to a change in motion.
"""
    assert [(c.topic, c.front) for c in drop.extract(text)] == [
        ("Joins", "What is a primary key?"),
        ("Normalization", "What does normalization refer to?"),
        ("Physics Review", "What is impulse?"),
        ("Momentum", "What is momentum?"),
        ("Series", "What is a geometric series?"),
        ("Energy", "What is kinetic energy?"),
        ("KEY TERMS", "What is inertia?"),
    ]


def test_list_opener_line_scopes_topic_to_its_list():
    text = "## Joins\nJoin types:\n- Inner join: keeps matching rows only\n- Left join: keeps every left row\nA cross join is a join that pairs every row with every row."
    assert [(c.kind, c.topic) for c in drop.extract(text)] == [
        ("list", "Join types"), ("term", "Join types"), ("term", "Join types"), ("definition", "Joins")]


@pytest.mark.parametrize("line, front, back, kind", [
    ("Foreign key: a column that references another table's primary key.",
     "What is a foreign key?", "A column that references another table's primary key.", "term"),
    ("Index - a structure that speeds up lookups on a column",
     "What is an index?", "A structure that speeds up lookups on a column", "term"),
    ("Tuple — a single row in a relation", "What is a tuple?", "A single row in a relation", "term"),
    ("Deadlock - two transactions each wait for a lock the other holds",
     "What is deadlock?", "Two transactions each wait for a lock the other holds", "term"),
    ("Mitosis - cell division", "What is mitosis?", "Cell division", "term"),
    ("**Cardinality**: the number of rows a relationship allows on each side",
     "What is cardinality?", "The number of rows a relationship allows on each side", "term"),
    ("Ratio test: use when the terms have factorials.",
     "When do you use the ratio test?", "Use when the terms have factorials.", "term"),
    ("Entropy is defined as a measure of disorder in a system.",
     "What is entropy?", "A measure of disorder in a system.", "definition"),
    ("Referential integrity refers to keeping foreign keys pointing at real rows.",
     "What does referential integrity refer to?", "Keeping foreign keys pointing at real rows.", "definition"),
    ("Atomicity means a transaction happens completely or not at all.",
     "What does atomicity mean?", "A transaction happens completely or not at all.", "definition"),
    ("A view is a saved query that acts like a table.",
     "What is a view?", "A saved query that acts like a table.", "definition"),
    ("Triggers are procedures that run automatically when data changes.",
     "What are triggers?", "Procedures that run automatically when data changes.", "definition"),
])
def test_definition_forms(line, front, back, kind):
    [only] = drop.extract(line)
    assert (only.front, only.back, only.kind) == (front, back, kind)


@pytest.mark.parametrize("subtitle", [
    "CNIT 182 - Fall 2026", "Prof. Rivera - Nov 4", "CNIT 182 — Spring 2027 · Purdue University"])
def test_course_and_date_subtitles_make_no_cards(subtitle):
    text = f"Lecture 15: Transactions\n{subtitle}\nA transaction is a sequence of operations treated as one unit."
    assert [c.front for c in drop.extract(text)] == ["What is a transaction?"]


@pytest.mark.parametrize("line", [
    "It is a common mistake to skip normalization.",
    "This is the hardest part of the course.",
    "There are three exams this semester.",
    "They are on the final.",
    "The thing we talked about in the second half of class is a big deal.",
])
def test_pronoun_and_long_subjects_make_no_definition(line):
    assert drop.extract(line) == []


@pytest.mark.parametrize("line, front, back", [
    ("Kinetic energy: K = 1/2 m v^2", "What's the formula for kinetic energy?", "K = 1/2 m v^2"),
    ("p = mv (momentum)", "What's the formula for momentum?", "p = mv"),
    ("Work done by gravity W = mgh", "What's the formula for work done by gravity?", "W = mgh"),
    ("F_net = dp/dt", "What's the formula for F_net?", "F_net = dp/dt"),
    ("Selectivity = matching rows / total rows", "What's the formula for selectivity?",
     "Selectivity = matching rows / total rows"),
])
def test_formula_forms(line, front, back):
    [only] = drop.extract(line)
    assert (only.front, only.back, only.kind) == (front, back, "formula")


def test_formula_needs_a_named_quantity():
    assert drop.extract("x = 3") == [] and drop.extract("a <= b + c") == []


@pytest.mark.parametrize("text, front, back", [
    ("Q: What does a LEFT JOIN keep?\nA: Every row from the left table.",
     "What does a LEFT JOIN keep?", "Every row from the left table."),
    ("Question: What is 3NF?\nAnswer: No transitive dependencies on the key.",
     "What is 3NF?", "No transitive dependencies on the key."),
    ("Q: When is the ratio test inconclusive? A: When the limit equals 1.",
     "When is the ratio test inconclusive?", "When the limit equals 1."),
    ("Question: Why normalize a schema? Answer: To remove update anomalies.",
     "Why normalize a schema?", "To remove update anomalies."),
    ("What does GROUP BY do?\nIt collapses rows that share a value into one row per group.",
     "What does GROUP BY do?", "It collapses rows that share a value into one row per group."),
])
def test_qa_forms(text, front, back):
    [only] = drop.extract(text)
    assert (only.front, only.back, only.kind) == (front, back, "qa")


def test_heading_with_bullets_becomes_list_card_and_term_bullets_get_their_own():
    cards = drop.extract("## Normal forms\n* 1NF: atomic values only\n* 2NF: no partial dependencies\n* 3NF: no transitive dependencies")
    assert [(c.kind, c.front) for c in cards] == [
        ("list", "What are the normal forms?"), ("term", "What is 1NF?"), ("term", "What is 2NF?"), ("term", "What is 3NF?")]
    assert cards[0].back == "• 1NF: atomic values only\n• 2NF: no partial dependencies\n• 3NF: no transitive dependencies"


def test_question_with_bullets_is_a_list_and_long_lists_are_not():
    [acid] = drop.extract("What are the ACID properties?\n- Atomicity\n- Consistency\n- Isolation\n- Durability")
    assert (acid.kind, acid.front, acid.back) == (
        "list", "What are the ACID properties?", "• Atomicity\n• Consistency\n• Isolation\n• Durability")
    nine = "Steps:\n" + "\n".join(f"- Step number {n} of the process" for n in range(1, 10))
    assert [c for c in drop.extract(nine) if c.kind == "list"] == []


def test_pdf_artifacts_are_cleaned_before_rules_run():
    text = ("Deﬁnitions\nNormaliza-\ntion refers to splitting tables so each fact\nis stored once.\n12\nPage 3 of 10\n"
            "Inﬂation: a general rise in prices over time.")
    assert pairs(text) == [
        ("What does normalization refer to?", "Splitting tables so each fact is stored once."),
        ("What is inflation?", "A general rise in prices over time.")]


def test_bullet_glyphs_are_recognized():
    text = ("Join types:\n• Inner join: keeps matching rows only\n▪ Left join: keeps every left row\n"
            "– Right join: keeps every right row\n* Cross join: pairs every row with every row\n"
            "- Self join: joins a table to itself\n1. Natural join: joins on same-named columns\n"
            "a) Anti join: keeps left rows with no match")
    cards = drop.extract(text)
    assert cards[0].kind == "list" and cards[0].back.count("•") == 7
    assert [c.back for c in cards[1:]] == [
        "Keeps matching rows only", "Keeps every left row", "Keeps every right row", "Pairs every row with every row",
        "Joins a table to itself", "Joins on same-named columns", "Keeps left rows with no match"]


def test_running_headers_and_footers_are_dropped():
    bodies = ["Exam 1 covers joins", "Exam 2 covers indexes", "Exam 3 covers transactions"]
    pages = [f"Joins handout\n{body}\n{FOOTER} · {n}" for n, body in enumerate(bodies, 1)]
    assert [p.strip() for p in drop.strip_running_lines(pages)] == bodies


def test_junk_lines_make_no_cards():
    text = ("https://purdue.brightspace.com/d2l/home\n* * * ---- ===\n§§ ¶¶ →→\nX: y\nQ: Why?\nA: Because.\n"
            "Course website: https://example.edu/cnit182")
    assert drop.extract(text) == []


def test_long_back_is_trimmed_at_a_sentence_boundary():
    sentence = "It splits wide tables into narrower ones that each describe a single thing. "
    [only] = drop.extract("Normalization: " + sentence * 6)
    assert len(only.back) <= drop.MAX_BACK and only.back.endswith("thing.")


def test_import_is_capped_at_150_cards(client):
    text = "\n".join(f"Widget {n}: part number {n} of the assembly" for n in range(1, 201))
    body = preview(client, text=text).json()
    assert body["stats"]["extracted"] == 150 and "150" in body["note"]


def test_lecture_fixture_yields_every_family():
    cards = drop.extract(LECTURE)
    assert {c.kind for c in cards} == set(drop.KINDS)
    assert {c.topic for c in cards} == {"Keys", "Types of joins", "Joins", "Normalization", "Query cost", "Practice"}
    fronts = {c.front: c for c in cards}
    assert fronts["What is a foreign key?"].back == "A column that points at the primary key of another table."
    assert fronts["What are the types of joins?"].back.count("•") == 4
    assert fronts["What's the formula for rows scanned?"].kind == "formula"
    assert fronts["Which join keeps customers who never placed an order?"].back == "LEFT JOIN from customers to orders."
    assert not any("http" in c.back or "Prof. Rivera" in c.back for c in cards)
    assert len(cards) >= 18


def test_syllabus_fixture_yields_course_facts():
    cards = {c.front: c.back for c in drop.extract(SYLLABUS)}
    assert cards["Who is the instructor?"] == "Dr. Maya Rivera (mrivera@purdue.edu)"
    assert cards["When are the office hours?"] == "Tue 3:00-4:30pm, KNOY 241"
    assert cards["How much are the exams worth?"] == "40%"
    assert cards["When is the final exam?"] == "Dec 14, 8:00am"
    assert cards["What's the breakdown of grading?"] == "• Exams 40%\n• Labs 25%\n• Project 25%\n• Participation 10%"
    assert not any("brightspace" in back for back in cards.values())


def test_pdf_preview_reads_pages_and_drops_footer(client):
    r = preview(client, files={"file": ("lecture12.pdf", make_pdf(PDF_PAGES), "application/pdf")})
    assert r.status_code == 200
    body = r.json()
    assert body["stats"]["pages"] == 3 and body["title"] == "Lecture 12 — Joins" and body["source"] == "fallback"
    text = " ".join(c["front"] + " " + c["back"] for c in body["cards"])
    assert "Fall 2026" not in text and "Page" not in text
    fronts = {c["front"]: c["back"] for c in body["cards"]}
    assert fronts["What is a foreign key?"] == "A column that references the primary key of another table."
    assert fronts["What is a view?"] == "A saved query that behaves like a table."
    assert fronts["Which join keeps unmatched left rows?"] == "LEFT JOIN"
    assert body["topics"][0] == "Joins"


def test_markdown_and_text_uploads(client):
    md = preview(client, files={"file": ("week9.MD", LECTURE.encode(), "text/markdown")}).json()
    assert md["title"] == "Lecture 12 — Joins and Normalization" and md["stats"]["pages"] is None
    assert md["stats"]["extracted"] == len(drop.extract(LECTURE)) and md["stats"]["chars"] == len(LECTURE)
    txt = preview(client, files={"file": ("momentum-notes.txt", b"Impulse: change in momentum over time.", "text/plain")}).json()
    assert txt["title"] == "momentum-notes" and txt["cards"][0]["front"] == "What is impulse?"
    titled = preview(client, text="Impulse: change in momentum over time.", title="PHYS 172 recap").json()
    assert titled["title"] == "PHYS 172 recap" and titled["cards"][0]["topic"] == "PHYS 172 recap"
    pasted = preview(client, text="Impulse: change in momentum over time.").json()
    assert pasted["title"] == "Pasted notes" and pasted["note"] is None


@pytest.mark.parametrize("fields, status", [
    ({"files": {"file": ("notes.docx", b"PK\x03\x04", "application/octet-stream")}}, 415),
    ({"text": "   "}, 400),
    ({}, 400),
    ({"text": "Index: a lookup structure", "files": {"file": ("a.txt", b"Tuple: a row", "text/plain")}}, 400),
    ({"files": {"file": ("empty.md", b"", "text/markdown")}}, 400),
    ({"files": {"file": ("broken.pdf", b"%PDF-1.4\nthis is not a pdf", "application/pdf")}}, 400),
    ({"files": {"file": ("binary.txt", b"\x00\x01\x02garbage", "text/plain")}}, 400),
])
def test_bad_input_gets_a_friendly_error(client, fields, status):
    r = preview(client, **fields)
    assert r.status_code == status and isinstance(r.json()["error"], str) and r.json()["error"]


def test_oversized_file_is_413(client):
    big = b"a" * (drop.MAX_FILE_BYTES + 10)
    r = preview(client, files={"file": ("huge.txt", big, "text/plain")})
    assert r.status_code == 413 and "15 MB" in r.json()["error"]


def test_encrypted_pdfs(client):
    pdf = make_pdf(PDF_PAGES)
    open_copy = preview(client, files={"file": ("enc.pdf", locked_copy(pdf, ""), "application/pdf")})
    assert open_copy.status_code == 200 and open_copy.json()["stats"]["extracted"] > 0
    locked = preview(client, files={"file": ("locked.pdf", locked_copy(pdf, "secret"), "application/pdf")})
    assert locked.status_code == 400 and "password" in locked.json()["error"]


def test_scanned_pdf_and_empty_extraction_explain_themselves(client):
    scanned = preview(client, files={"file": ("scan.pdf", make_pdf(["", "", ""]), "application/pdf")}).json()
    assert scanned["cards"] == [] and scanned["stats"]["pages"] == 3 and "selectable text" in scanned["note"]
    nothing = preview(client, text="hello there\nsee you thursday").json()
    assert nothing["cards"] == [] and "Term: definition" in nothing["note"]


def test_duplicates_flagged_against_decks_and_within_batch(client):
    client.post("/api/cards", json={"front": "Define surrogate key", "back": "An artificial id", "deck_slug": "inbox"})
    text = ("Surrogate key: a made-up identifier with no business meaning.\n"
            "Natural key: a key built from real-world data.\n"
            "What is a natural key?\nA key made of real business data.")
    body = preview(client, text=text).json()
    assert [(c["front"], c["duplicate"]) for c in body["cards"]] == [
        ("What is a surrogate key?", True), ("What is a natural key?", False), ("What is a natural key?", True)]
    assert body["stats"] == {"extracted": 3, "duplicates": 2, "new": 1, "pages": None, "chars": len(text)}


def commit(client, cards, title="Lecture 9 — Indexes", deck_slug=None, source="fallback"):
    return client.post("/api/drop/commit", json={"cards": cards, "title": title, "deck_slug": deck_slug, "source": source})


INDEX_CARDS = [
    {"front": "What is a clustered index?", "back": "An index that sets the physical row order.", "topic": "Indexes"},
    {"front": "What is a covering index?", "back": "An index holding every column a query needs.", "topic": "Indexes"},
    {"front": "When does an index hurt?", "back": "On write-heavy tables, every insert updates it.", "topic": "Indexes"},
]


def test_commit_creates_deck_and_recommit_adds_nothing(client):
    first = commit(client, INDEX_CARDS)
    assert first.status_code == 200
    body = first.json()
    assert body["deck"]["slug"] == "drop-lecture-9-indexes" and body["deck"]["name"] == "Lecture 9 — Indexes"
    assert body["added"] == 3 and body["skipped_duplicates"] == 0
    assert [c["front"] for c in body["cards"]] == [c["front"] for c in INDEX_CARDS]
    assert all(c["source"] == "drop" and c["repetitions"] == 0 and c["deck_slug"] == "drop-lecture-9-indexes"
               for c in body["cards"])
    again = commit(client, INDEX_CARDS).json()
    assert again["deck"] == body["deck"] and again["added"] == 0 and again["skipped_duplicates"] == 3
    deck = next(d for d in client.get("/api/decks").json()["decks"] if d["slug"] == "drop-lecture-9-indexes")
    assert deck["total"] == 3 and "Munki Drop" in deck["description"]


def test_same_title_gets_a_new_slug_and_batch_duplicates_are_skipped(client):
    cards = [{"front": "What is a hash index?", "back": "An index for equality lookups.", "topic": "Indexes"},
             {"front": "What's a hash index?", "back": "Equality-only index.", "topic": "Indexes"}]
    body = commit(client, cards).json()
    assert body["deck"]["slug"] == "drop-lecture-9-indexes-2" and body["added"] == 1 and body["skipped_duplicates"] == 1


def test_commit_into_existing_deck(client):
    cards = [{"front": "What is a B-tree?", "back": "A balanced tree most SQL indexes use.", "topic": "Indexes"}]
    body = commit(client, cards, deck_slug="inbox").json()
    assert body["deck"]["slug"] == "inbox" and body["added"] == 1


def test_committed_cards_lead_the_feed_in_document_order(client):
    cards = [{"front": f"What does EXPLAIN show for query {n}?", "back": f"The plan for query {n}.", "topic": "Plans"}
             for n in (1, 2, 3)]
    body = commit(client, cards, title="Query plans").json()
    ids = [c["id"] for c in body["cards"]]
    assert [c["front"] for c in body["cards"]] == [c["front"] for c in cards]
    feed = client.get("/api/feed?limit=10").json()["cards"]
    assert [c["id"] for c in feed[:3]] == ids and feed[0]["source"] == "drop"
    deck_feed = client.get(f"/api/feed?limit=10&deck_id={body['deck']['id']}").json()["cards"]
    assert [c["id"] for c in deck_feed] == ids


def test_notes_alias_uses_drop_extractor(client):
    r = client.post("/api/notes/cards", json={"text": LECTURE}).json()
    assert r["source"] == "fallback"
    assert r["cards"] == [{"front": c.front, "back": c.back, "topic": c.topic} for c in drop.extract(LECTURE)]


def test_no_key_labels_fallback(client):
    body = preview(client, text=LECTURE).json()
    assert body["source"] == "fallback" and body["source_label"] == "Built-in extractor (offline)"


def test_meta_path_labels_meta_and_still_dedupes(client, monkeypatch):
    seen = []

    def fake_generate(text):
        seen.append(text)
        return [{"front": "Which join keeps every left row?", "back": "LEFT JOIN", "topic": "Joins"},
                {"front": "Define surrogate key", "back": "An artificial id column.", "topic": "Keys"}]

    monkeypatch.setattr(meta_client, "available", lambda: True)
    monkeypatch.setattr(meta_client, "generate_cards", fake_generate)
    body = preview(client, text=LECTURE).json()
    assert body["source"] == "meta-api" and body["source_label"] == "Meta AI (muse-spark)"
    assert [(c["front"], c["topic"], c["duplicate"]) for c in body["cards"]] == [
        ("Which join keeps every left row?", "Joins", False), ("Define surrogate key", "Keys", True)]
    assert len(seen) == 1 and "Composite key" in seen[0]
    assert client.post("/api/notes/cards", json={"text": LECTURE}).json()["source"] == "meta-api"


def test_meta_path_chunks_long_text(client, monkeypatch):
    seen = []
    monkeypatch.setattr(meta_client, "available", lambda: True)
    monkeypatch.setattr(meta_client, "generate_cards",
                        lambda text: seen.append(text) or [{"front": f"Chunk question {len(seen)}?", "back": "Yes", "topic": "T"}])
    body = preview(client, text=LECTURE * 30).json()
    assert len(seen) == drop.META_MAX_CHUNKS and all(len(t) <= drop.META_CHUNK_CHARS for t in seen)
    assert body["source"] == "meta-api" and "Meta AI read the first" in body["note"]


def test_meta_failure_falls_back_with_note(client, monkeypatch):
    def broken(text):
        raise TimeoutError("model timed out")

    monkeypatch.setattr(meta_client, "available", lambda: True)
    monkeypatch.setattr(meta_client, "generate_cards", broken)
    body = preview(client, text=LECTURE).json()
    assert body["source"] == "fallback" and body["source_label"] == "Built-in extractor (offline)"
    assert "Meta AI" in body["note"] and body["stats"]["extracted"] == len(drop.extract(LECTURE))
