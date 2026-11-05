"""Stdlib-only PDF builder for tests: one Helvetica text object per page,
one line per text-showing operator, and byte-exact xref offsets."""


def _literal(line):
    out = []
    for byte in line.encode("cp1252", errors="replace"):
        ch = chr(byte)
        if ch in "()\\":
            out.append("\\" + ch)
        elif byte < 32 or byte > 126:
            out.append(f"\\{byte:03o}")
        else:
            out.append(ch)
    return "(" + "".join(out) + ")"


def _content(page):
    ops = ["BT", "/F1 11 Tf", "14 TL", "72 740 Td"]
    for k, line in enumerate(page.split("\n")):
        if k:
            ops.append("T*")
        ops.append(f"{_literal(line)} Tj")
    ops.append("ET")
    stream = "\n".join(ops).encode("latin-1")
    return b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream"


def make_pdf(pages: list[str]) -> bytes:
    """A PDF whose page k shows pages[k], one line per newline-separated line."""
    page_ids = [4 + 2 * k for k in range(len(pages))]
    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]
    for pid, page in zip(page_ids, pages):
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                       f"/Resources << /Font << /F1 3 0 R >> >> /Contents {pid + 1} 0 R >>".encode())
        objects.append(_content(page))
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for number, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % off for off in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)
