#!/usr/bin/env python3
"""Regenerate the synthetic manual-test fixtures (see README.md here).

Every document is fictional (JOHN FIXTURE) and watermarked SYNTHETIC TEST
DOCUMENT. Keep the classifier key-phrases if you edit the text.
"""
import os
import zipfile

os.chdir(os.path.dirname(os.path.abspath(__file__)))


def minimal_pdf(text: str) -> bytes:
    return (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R"
        b"/Resources<</Font<</F1 5 0 R>>>>>>>>endobj\n"
        b"4 0 obj<</Length " + str(len(text) + 44).encode() + b">>stream\n"
        b"BT /F1 9 Tf 40 720 Td (" + text.encode() + b") Tj ET\nendstream endobj\n"
        b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
        b"trailer<</Root 1 0 R>>\n%%EOF"
    )


DOCS = {
    "judgment.pdf": "JUDGMENT OF CONVICTION BY JURY. Cause No. 45678. THE STATE OF TEXAS v. JOHN FIXTURE. In the 147th District Court of Travis County, Texas. The defendant was adjudged GUILTY of the offense of aggravated robbery. Punishment assessed at 25 years confinement in the Texas Department of Criminal Justice. This is a SYNTHETIC TEST DOCUMENT - no real person or case.",
    "indictment.pdf": "INDICTMENT. THE GRAND JURY of Travis County, Texas, duly organized, presents that JOHN FIXTURE on or about January 1, 2020 did then and there intentionally commit the offense of aggravated robbery. Cause No. 45678. SYNTHETIC TEST DOCUMENT - no real person or case.",
    "reporters-record-vol1.pdf": "REPORTER'S RECORD VOLUME 1 OF 3. Cause No. 45678. THE STATE OF TEXAS v. JOHN FIXTURE. Trial on the merits. THE COURT: The objection to the comparison testimony is overruled. SYNTHETIC TEST DOCUMENT - no real person or case.",
    "plea-papers.pdf": "WAIVER OF JURY AND PLEA OF GUILTY. Cause No. 45679. Comes now the defendant JOHN FIXTURE and waives the right of trial by jury and enters a plea of guilty. SYNTHETIC TEST DOCUMENT - no real person or case.",
}

for name, text in DOCS.items():
    with open(name, "wb") as f:
        f.write(minimal_pdf(text))

with open("notes.txt", "w") as f:
    f.write("Unsupported file type - the pipeline must SKIP this inside a ZIP and say so.\n")

with zipfile.ZipFile("court-papers.zip", "w") as z:
    for name in DOCS:
        z.write(name, f"papers/{name}")
    z.write("notes.txt", "papers/notes.txt")
    z.writestr("__MACOSX/papers/._junk", b"x")  # macOS junk, must be pruned

print("fixtures rebuilt:", ", ".join(sorted(os.listdir("."))))
