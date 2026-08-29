#!/usr/bin/env python3
"""Render a repo Markdown document to PDF in the house style.

House style is set by the existing exports: US Letter, serif headings,
sans body, mono for code. Tables repeat their header row across page
breaks and never split a row.

Usage:  python3 scripts/md_to_pdf.py docs/business_case/business_case.md [out.pdf]
Deps:   pip install markdown playwright   (Chromium is preinstalled; do NOT run
        `playwright install` — set CHROME_PATH if the binary lives elsewhere.)
"""
import os, sys, pathlib, re, markdown
from playwright.sync_api import sync_playwright

# The preinstalled Chromium rarely matches the pip package's pinned build, so
# point at it explicitly rather than downloading a second copy.
CHROME = os.environ.get("CHROME_PATH") or next(
    (p for p in ("/opt/pw-browsers/chromium",
                 "/usr/bin/chromium", "/usr/bin/chromium-browser",
                 "/usr/bin/google-chrome") if os.path.exists(p)), None)

CSS = """
@page { size: Letter; margin: 0.7in 0.65in 0.75in 0.65in; }
* { box-sizing: border-box; }
body { font-family: "Liberation Sans", Arial, Helvetica, sans-serif;
       font-size: 9.5pt; line-height: 1.46; color: #1a1a1a; margin: 0;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2, h3, h4 { font-family: "Liberation Serif", Georgia, serif; font-weight: 700;
                 color: #111; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 21pt; margin: 0 0 .35em; padding-bottom: .28em; border-bottom: 2px solid #222; letter-spacing: -.01em; }
h2 { font-size: 14pt; margin: 1.5em 0 .5em; padding-bottom: .2em; border-bottom: 1px solid #d5d5d5; }
h3 { font-size: 11.5pt; margin: 1.25em 0 .4em; }
h4 { font-size: 10pt; margin: 1em 0 .3em; }
p, ul, ol { margin: .5em 0; }
li { margin: .22em 0; }
strong { font-weight: 700; color: #000; }
a { color: #1a4f7a; text-decoration: none; }
code { font-family: "DejaVu Sans Mono", monospace; font-size: 8.4pt;
       background: #f2f2f2; padding: .5pt 2.5pt; border-radius: 2px; }
pre { background: #f6f6f6; border: 1px solid #e0e0e0; padding: 7px 9px;
      font-size: 8.2pt; overflow-x: auto; page-break-inside: avoid; }
pre code { background: none; padding: 0; }
hr { border: 0; border-top: 1px solid #ddd; margin: 1.3em 0; }
blockquote { margin: .8em 0; padding: .55em .8em; background: #f7f8f9;
             border-left: 3px solid #9aa5b1; page-break-inside: avoid; }
blockquote p { margin: .25em 0; }
table { width: 100%; border-collapse: collapse; margin: .7em 0; font-size: 8.6pt; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; break-inside: avoid; }
th { background: #eceff1; border: 1px solid #c8ccd0; padding: 4.5px 6px;
     text-align: left; font-weight: 700; }
td { border: 1px solid #d8dcdf; padding: 4.5px 6px; vertical-align: top; }
tbody tr:nth-child(even) td { background: #fafbfc; }
/* the metadata block under the title */
h1 + p { color: #444; font-size: 8.8pt; border-bottom: 1px solid #eee; padding-bottom: .7em; }
"""

FOOTER = """<div style="font-family:'Liberation Sans',Arial,sans-serif;font-size:7pt;color:#777;
width:100%;padding:0 0.65in;display:flex;justify-content:space-between;">
<span>{title}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>"""


def render(src: pathlib.Path, out: pathlib.Path) -> None:
    text = src.read_text(encoding="utf-8")
    title = next((l.lstrip("# ").strip() for l in text.splitlines() if l.startswith("# ")), src.stem)
    body = markdown.markdown(
        text, extensions=["tables", "fenced_code", "sane_lists", "attr_list", "md_in_html"]
    )
    html = (f'<!doctype html><html><head><meta charset="utf-8">'
            f"<title>{title}</title><style>{CSS}</style></head><body>{body}</body></html>")
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        page = browser.new_page()
        page.set_content(html, wait_until="load")
        page.pdf(path=str(out), format="Letter", print_background=True,
                 display_header_footer=True, header_template="<div></div>",
                 footer_template=FOOTER.format(title=re.sub(r"[<>&]", "", title)),
                 margin={"top": "0.7in", "bottom": "0.75in", "left": "0.65in", "right": "0.65in"})
        browser.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = pathlib.Path(sys.argv[1])
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".pdf")
    render(src, out)
    print(f"{src} -> {out} ({out.stat().st_size/1024:.0f} KB)")
