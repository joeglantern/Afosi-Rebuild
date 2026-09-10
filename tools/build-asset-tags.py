"""
Generate the printable barcode asset tags from public/data/assets.json.

    python tools/build-asset-tags.py

Everything lands in asset-tags/ - that whole folder is what you send to the company
printing the tags, and AFOSI-asset-tags.zip next to it is the same thing as one
file. See the README.txt this writes for the note to hand the printer.

The barcodes are Code 128 and encode the tag number itself ("AFOSI/015"), not a
URL: a 1D barcode is read by a handheld scanner, which types the text out like a
keyboard. It cannot open a web page. The live asset page is still there at
afosi.org/asset.html and takes the same number typed (or scanned) into its
lookup box.

Every tag encodes 9 characters, so all 30 barcodes come out exactly the same
width - which is what makes them predictable to print and to scan.
"""

import base64
import csv
import json
import subprocess
import zipfile
from pathlib import Path

from barcode.codex import Code128
from PIL import Image, ImageFont

ROOT = Path(__file__).resolve().parent.parent
REGISTER = ROOT / "public" / "data" / "assets.json"
LOGO = ROOT / "public" / "assets" / "afosi" / "afosi_logo.png"
OUT = ROOT / "asset-tags"

SITE = "afosi.org"
INK = "#17150F"
ORANGE = "#F26522"

# Physical label. 50 x 30 mm is the common stock size for asset tags; the
# printer can scale the whole SVG proportionally if they use another size.
LABEL_W, LABEL_H = 50.0, 30.0

# Barcode geometry, all in mm.
#
# SIDE is the margin from the label edge to the start of the barcode's quiet
# zone. QUIET_MODULES is the clear space Code 128 requires either side of the
# bars, measured in modules (10 is the spec minimum) - get this wrong and
# scanners fail intermittently in a way that looks like a bad print run.
SIDE = 3.5
QUIET_MODULES = 10
BAR_TOP, BAR_H = 7.6, 12.0

FONTS = {
    "mono": Path("C:/Windows/Fonts/courbd.ttf"),
    "sans": Path("C:/Windows/Fonts/arial.ttf"),
    "sans-bold": Path("C:/Windows/Fonts/arialbd.ttf"),
}


def barcode_data(asset):
    """What the scanner will type out. The register's own tag is used, minus any
    funder suffix: AFOSI/015/Childfund would need 19 characters, which at this
    label size forces the bars below the width a scanner can read reliably.
    The number alone is already unique, and the funder is on the asset page."""
    return "AFOSI/" + asset["id"].split("-")[1]


def modules(data):
    """Code 128 as a string of '1' (bar) and '0' (space), one character per
    module. python-barcode picks the character set and computes the checksum."""
    return Code128(data).build()[0]


def bar_runs(pattern):
    """Collapse the module string into (start, width) runs of bars, in modules.
    Adjacent dark modules become one rectangle so the printer's RIP sees clean
    bar geometry rather than a row of abutting squares."""
    runs, i, n = [], 0, len(pattern)
    while i < n:
        if pattern[i] == "0":
            i += 1
            continue
        j = i
        while j < n and pattern[j] == "1":
            j += 1
        runs.append((i, j - i))
        i = j
    return runs


def barcode_svg_parts(data, width_mm, x0, y0, height_mm):
    """Bars as a single SVG path, scaled to fill width_mm including quiet zones.
    Returns the path and the X-dimension so it can be reported to the printer."""
    pattern = modules(data)
    x_dim = width_mm / (len(pattern) + QUIET_MODULES * 2)
    left = x0 + QUIET_MODULES * x_dim
    path = "".join(
        f"M{left + start * x_dim:.4f} {y0:.4f}h{run * x_dim:.4f}v{height_mm:.4f}h-{run * x_dim:.4f}z"
        for start, run in bar_runs(pattern)
    )
    return path, x_dim


def logo_data_uri():
    """Trimmed, downscaled copy of the logo, embedded so each label SVG is a
    single self-contained file the printer can open anywhere."""
    if not LOGO.exists():
        return None, 1149 / 524
    img = Image.open(LOGO).convert("RGBA")
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    ratio = img.width / img.height
    img = img.resize((420, int(420 / ratio)), Image.LANCZOS)
    tmp = OUT / ".logo.png"
    img.save(tmp, optimize=True)
    uri = "data:image/png;base64," + base64.b64encode(tmp.read_bytes()).decode()
    tmp.unlink()
    return uri, ratio


def text_width(text, face, size_mm, spacing=0.0):
    """Width in mm of `text` set in `face` at `size_mm`, from the real font.
    Letter-spacing counts: SVG adds it after every character but the last."""
    font = ImageFont.truetype(str(FONTS[face]), 200)
    return font.getlength(text) / 200 * size_mm + spacing * max(len(text) - 1, 0)


def label_text(x, y, text, face, size, fill, weight="400", spacing=0.0, anchor=None):
    """Text pinned to a measured width. textLength makes the line occupy exactly
    that much space whatever font the printer's machine substitutes, so nothing
    can creep off the edge of the label."""
    family = "Courier New, Courier, monospace" if face == "mono" else "Arial, Helvetica, sans-serif"
    width = text_width(text, face, size, spacing)
    attrs = f' letter-spacing="{spacing}"' if spacing else ""
    if anchor:
        attrs += f' text-anchor="{anchor}"'
    return (f'<text x="{x:.2f}" y="{y:.2f}" font-family="{family}" font-size="{size}" '
            f'font-weight="{weight}"{attrs} textLength="{width:.2f}" lengthAdjust="spacing" '
            f'fill="{fill}">{text}</text>')


def label_svg(asset, logo_uri, logo_ratio):
    """The tag artwork at true physical size: identity strip, bars, number."""
    data = barcode_data(asset)
    bars, x_dim = barcode_svg_parts(data, LABEL_W - SIDE * 2, SIDE, BAR_TOP, BAR_H)

    logo_h = 3.4
    logo_w = logo_h * logo_ratio
    logo = (
        f'<image href="{logo_uri}" x="{SIDE:.2f}" y="2.4" width="{logo_w:.2f}" height="{logo_h:.2f}"/>'
        if logo_uri else
        label_text(SIDE, 5.4, "AFOSI", "sans-bold", 3.6, INK, "700")
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{LABEL_W}mm" height="{LABEL_H}mm" viewBox="0 0 {LABEL_W} {LABEL_H}">
  <title>AFOSI asset tag {data}</title>
  <desc>Code 128, X-dimension {x_dim:.3f} mm</desc>
  <rect width="{LABEL_W}" height="{LABEL_H}" rx="1.6" fill="#FFFFFF"/>
  <rect x="0.5" y="0.5" width="{LABEL_W - 1}" height="{LABEL_H - 1}" rx="1.3" fill="none" stroke="{INK}" stroke-width="0.5"/>
  {logo}
  {label_text(LABEL_W - SIDE, 5.3, "PROPERTY OF AFOSI", "sans-bold", 2.1, INK, "700", 0.08, "end")}
  <path d="{bars}" fill="{INK}"/>
  {label_text(LABEL_W / 2, 24.4, data, "mono", 4.4, ORANGE, "700", 0.15, "middle")}
  {label_text(LABEL_W / 2, 27.9, SITE, "sans", 2.1, "#5A5346", "700", 0.05, "middle")}
</svg>"""


def barcode_svg(data, width_mm=60.0, height_mm=18.0):
    """Bare barcode as standalone vector, quiet zones included."""
    bars, _ = barcode_svg_parts(data, width_mm, 0, 2.0, height_mm)
    total_h = height_mm + 4.0
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width_mm}mm" height="{total_h}mm" '
        f'viewBox="0 0 {width_mm} {total_h}">'
        f'<rect width="{width_mm}" height="{total_h}" fill="#FFFFFF"/>'
        f'<path d="{bars}" fill="{INK}"/></svg>'
    )


def barcode_png(data, path, module_px=6, height_px=260, quiet_px=None):
    """Raster copy. The module width is a whole number of pixels so every bar
    comes out identical - resampling a barcode to a fractional module is the
    usual cause of a code that scans on screen but not on paper."""
    pattern = modules(data)
    quiet = quiet_px if quiet_px is not None else QUIET_MODULES * module_px
    width = len(pattern) * module_px + quiet * 2
    img = Image.new("1", (width, height_px + 2 * module_px), 1)
    for start, run in bar_runs(pattern):
        x = quiet + start * module_px
        for px in range(x, x + run * module_px):
            for py in range(module_px, module_px + height_px):
                img.putpixel((px, py), 0)
    img.save(path)


def print_sheet(assets):
    """Nothing but the tags. Titles and instructions on the sheet would be
    printed alongside the labels or have to be trimmed off, so the guidance
    lives in README.txt instead."""
    cards = "\n".join(
        f'    <img src="labels/{a["id"]}.svg" alt="{a["tag"]}">' for a in assets
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AFOSI asset tags</title>
<style>
  @page {{ size: A4; margin: 10mm; }}
  body {{ margin: 0; padding: 10mm; background: #fff; }}
  .grid {{ display: grid; grid-template-columns: repeat(3, 50mm); gap: 6mm 5mm; }}
  img {{ display: block; width: 50mm; height: 30mm; }}
  @media print {{ body {{ padding: 0; }} }}
</style>
</head>
<body>
  <div class="grid">
{cards}
  </div>
</body>
</html>"""


def readme(x_dim, count):
    return f"""AFOSI ASSET BARCODE TAGS: notes for the printer
==============================================

WHAT IS HERE
  labels/       Final tag artwork, one SVG per asset, drawn at true size
                50 x 30 mm. This is the file to print. Self-contained
                (logo embedded), so nothing else needs to be supplied.
  barcode/      The bare barcode on its own (SVG vector + PNG), in case you
                are laying the tags out yourself in your own template.
  print-sheet.pdf    All {count} tags at true size, 3 per row, nothing else on
                the page. print-sheet.html is the same thing if you prefer it.
  asset-tags.csv     Index: tag number, asset name, what each barcode encodes,
                and the matching file names.

BARCODE
  Symbology     Code 128 (auto character set, with check digit)
  Encodes       The tag number only, e.g. AFOSI/015. No URL.
  X-dimension   {x_dim:.3f} mm at the supplied size. Do not print smaller.
                If you scale the label, scale it proportionally and keep the
                X-dimension at or above 0.25 mm.
  Bar height    12 mm. Do not shorten the bars to fit other elements; short
                bars are the most common cause of a tag that will not scan
                at an angle.
  Quiet zone    The clear space either side of the bars is 10 modules and is
                already built into the artwork. Nothing goes into it: no
                border, no text, no screw hole, no die-cut edge.
  Orientation   Bars vertical, as supplied. Do not rotate the barcode alone.

PRINT
  Label size    50 x 30 mm (scale the whole SVG proportionally for other sizes)
  Colours       Bars must be solid black on white. Do not tint them, screen
                them, reverse them out, or print them over a coloured panel.
                The orange (#F26522) is for the tag number text only.
  Text          Set in Arial/Helvetica and Courier. Convert to outlines before
                output if your workflow needs it. The shapes must not reflow,
                because the tag number is the one thing that must stay exact.
  Material      Please advise: these go on laptops, office chairs, desks and
                a photocopier, and need to survive daily handling. Vinyl or
                anodised aluminium with a permanent adhesive is expected.
                A matt finish scans better than gloss under office lighting.

BEFORE THE FULL RUN
  Print one tag and scan it with a handheld scanner to confirm it reads first
  time and returns the number printed underneath the bars. Every tag is
  different, not copies of one another, so quantities are 1 per design.
"""


CHROME_PATHS = [
    Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    Path.home() / "AppData/Local/Google/Chrome/Application/chrome.exe",
    Path("C:/Program Files/Microsoft/Edge/Application/msedge.exe"),
]


def proof_pdf(sheet_html):
    """Print the proof sheet to PDF - printers would rather receive a PDF than
    an HTML file. Skipped with a note if no Chrome/Edge is installed."""
    browser = next((p for p in CHROME_PATHS if p.exists()), None)
    if not browser:
        print("  (no Chrome/Edge found - skipping print-sheet.pdf; open print-sheet.html and print to PDF)")
        return
    subprocess.run(
        [str(browser), "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={OUT / 'print-sheet.pdf'}", sheet_html.as_uri()],
        capture_output=True, timeout=120,
    )


def bundle(zip_path):
    """One file to email the printer."""
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(OUT.rglob("*")):
            if path.is_file():
                zf.write(path, Path("AFOSI-asset-tags") / path.relative_to(OUT))


def main():
    if not REGISTER.exists():
        raise SystemExit("Run tools/build-asset-register.py first - public/data/assets.json is missing.")
    assets = json.loads(REGISTER.read_text(encoding="utf-8"))["assets"]

    for sub in ("labels", "barcode/svg", "barcode/png"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    for stale in OUT.glob("qr/**/*"):
        if stale.is_file():
            stale.unlink()
    for stale in sorted(OUT.glob("qr/**/"), reverse=True):
        if stale.is_dir():
            stale.rmdir()

    logo_uri, logo_ratio = logo_data_uri()
    x_dim = (LABEL_W - SIDE * 2) / (len(modules(barcode_data(assets[0]))) + QUIET_MODULES * 2)

    rows = []
    for asset in assets:
        data = barcode_data(asset)
        (OUT / "labels" / f"{asset['id']}.svg").write_text(label_svg(asset, logo_uri, logo_ratio), encoding="utf-8")
        (OUT / "barcode" / "svg" / f"{asset['id']}.svg").write_text(barcode_svg(data), encoding="utf-8")
        barcode_png(data, OUT / "barcode" / "png" / f"{asset['id']}.png")

        rows.append({
            "Asset tag (register)": asset["tag"],
            "Asset name": asset["name"],
            "Assigned to": asset["custodian"],
            "Barcode encodes": data,
            "Label file": f"labels/{asset['id']}.svg",
            "Bare barcode (vector)": f"barcode/svg/{asset['id']}.svg",
            "Bare barcode (image)": f"barcode/png/{asset['id']}.png",
            "Quantity": 1,
        })

    with (OUT / "asset-tags.csv").open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    sheet = OUT / "print-sheet.html"
    sheet.write_text(print_sheet(assets), encoding="utf-8")
    (OUT / "README.txt").write_text(readme(x_dim, len(assets)), encoding="utf-8")
    proof_pdf(sheet)

    zip_path = ROOT / "AFOSI-asset-tags.zip"
    bundle(zip_path)

    print(f"{len(assets)} Code 128 tags -> {OUT.relative_to(ROOT)}/  (X-dimension {x_dim:.3f} mm)")
    print(f"send to printer  -> {zip_path.name} ({zip_path.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
