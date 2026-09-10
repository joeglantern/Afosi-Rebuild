# Asset barcode tags

Every physical asset in the office carries a printed tag with a **Code 128
barcode of its number** (`AFOSI/015`) and the number in plain text underneath.

A 1D barcode cannot open a web page. A handheld scanner reads it and types the
number out like a keyboard, so it is for stock-takes and for pulling an asset up
in a spreadsheet. The live asset page is still there:

    https://afosi.org/asset.html

Type the tag number into its lookup box, or put the cursor in the box and scan
the tag — the scanner types the number and presses Enter, which submits the
form. Deep links like `asset.html?id=AFOSI-015` still work.

## The two scripts

    python tools/build-asset-register.py "C:/path/to/Asset Register updated.xlsx"
    python tools/build-asset-tags.py

The first reads the spreadsheet and writes `public/data/assets.json` — the file
the site serves. The second reads that JSON and writes the printable artwork to
`asset-tags/`, plus `AFOSI-asset-tags.zip` to send the printer.

Run them in that order. Neither touches the other's input, so both are safe to
re-run any number of times.

## What the barcode encodes

`AFOSI/015` — the register's tag number, and nothing else. Two rows in the
register carry a funder suffix (`AFOSI/015/Childfund`, `AFOSI/016/Childfund`);
those are **not** encoded, because 19 characters on a 50 mm label would force
the bars below the width a scanner reads reliably. The number alone is already
unique, and the funder shows on the asset page under "Funded by".

`asset-tags.csv` lists both the full register tag and what each barcode
encodes, so the mapping is never in doubt.

All 30 barcodes come out exactly the same width (134 modules), which is what
makes them predictable to print and to scan.

## What is public and what is not

The asset page is public and the tag numbers are guessable, so `assets.json`
carries only what is safe for a stranger to read: tag number, asset name,
description, category, custodian, condition and donor.

**The purchase amount, the depreciation column and the internal comments are
never written to it.** They stay in the spreadsheet. If you later add a money
field to the page, understand that you are publishing the value of every item
in the office next to the name of the person holding it.

## When the register changes

Adding, removing or reassigning an asset:

1. Update the spreadsheet.
2. Re-run `build-asset-register.py`, then `build-asset-tags.py`.
3. Commit `public/data/assets.json` and redeploy the site (below).
4. Only *new* assets need new tags printed — existing tag numbers keep working,
   because the barcode encodes the number, not any of the details.

The build fails loudly if two rows would map to the same tag number, rather than
silently printing two tags that scan identically.

## Deploying

The page is static, so it ships with the normal site build:

    npm run build

then redeploy `dist/` to `/var/www/afosi-rebuild/dist` as usual. Check
`dist/data/assets.json` is present after building.

No nginx change is needed — `asset.html` is a real file and the query string is
read in the browser.

## Sending the tags to the printer

`AFOSI-asset-tags.zip` contains everything, including `README.txt` written for
the printer with the symbology, X-dimension, bar height and quiet-zone spec.
Inside:

| | |
|---|---|
| `labels/` | Final tag artwork, one SVG per asset, at true size 50 × 30 mm. **This is what gets printed.** Self-contained — the logo is embedded. |
| `barcode/svg/`, `barcode/png/` | The bare barcode alone, if they would rather use their own template |
| `print-sheet.pdf` | All 30 tags at true size, nothing else on the page |
| `asset-tags.csv` | Register tag, asset name, custodian, what each barcode encodes, and file names |

Key numbers for the printer: **Code 128**, X-dimension **0.279 mm** at 50 × 30
mm, bar height **12 mm**, quiet zone **10 modules** (already in the artwork).
Do not let them shorten the bars or shrink the X-dimension below 0.25 mm.

Every tag is unique, so the quantity is 1 per design — worth saying explicitly,
since print quotes usually assume one artwork run many times.

Before the full run, print one tag and scan it with the handheld scanner to
confirm it reads first time and returns the number printed under the bars.
