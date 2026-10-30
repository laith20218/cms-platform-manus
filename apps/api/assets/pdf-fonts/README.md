# pdf-fonts — Wave 11.9 Arabic font pack (Ghostscript)

OFL-licensed Arabic fonts baked into the API image at `/app/ghostscript-fonts`
(see `apps/api/Dockerfile`) and consumed by `PdfProcessingService` via
`gs -sFONTPATH=$(GHOSTSCRIPT_FONTS_PATH)` when re-embedding broken/missing
fonts into uploaded PDFs (`-sDEVICE=pdfwrite -dEmbedAllFonts=true -dSubsetFonts=true`).

| File | Source | License |
|---|---|---|
| `Amiri-Regular.ttf` | google/fonts `ofl/amiri` (The Amiri Project) | `OFL-AMIRI.txt` |
| `NotoNaskhArabic-Regular.ttf` | notofonts.github.io `fonts/NotoNaskhArabic/full/ttf` (The Noto Project) | `OFL-NOTO-NASKH.txt` |

Both licenses permit bundling/redistribution in server deployments. To refresh a
font, re-download from the source above and keep the license file next to it.
