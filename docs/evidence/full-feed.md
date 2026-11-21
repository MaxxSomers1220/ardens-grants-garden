# Full-feed garden acceptance

The garden uses `rigbys-cloud-feed.json.gz`, generated **November 21, 2026 at 1:00:54 a.m. EST** (`2026-11-21T06:00:54.859651+00:00`). It contains **769 unique opportunities**. The committed `data/feed.json.gz` is reorganized into independent gzip members and decompresses byte-for-byte to the original 223,184,470-byte JSON. The packer verified all 769 record ranges and their hashes. The browser loads the small index and bed assignments before the first field paint.

| Bed | Records |
| --- | ---: |
| Rare disease | 5 |
| Neuroscience | 42 |
| Cancer | 39 |
| Climate & energy | 12 |
| AI & data science | 15 |
| Infectious disease | 24 |
| Other opportunities | 632 |
| **Total** | **769** |

The export has no assigned topics. Explicit phrases in the title and opening synopsis define the topical grouping. Other opportunities holds 628 records without a clear topical match and four with equally strong synopsis-only cues. Title ties follow the documented precedence. All IDs and tie results are in the [assignment manifest](../../data/bed-assignments.json).

| Check | Result | Evidence |
| --- | --- | --- |
| Full field and data provenance | Pass | All 769 unique source IDs appear exactly once in the numbered beds. The source generation, count, compact fields and Grants.gov URLs match the export. The page displays its filename, date and count. |
| Crop, neutral and deadline indicators | Pass | 736 pale neutral records and 132 gold deadline markers at the check date. Structural markers and the combined bloom paths match the source-derived states. |
| Record details and links | Pass | 17 decoded records matched the export exactly during HTTP Range tests. Verified visible titles, sponsors, deadlines, amounts, score evidence, summaries, requirements and source links. Paged award and paper lists expose the recorded counts and URLs. |
| On-demand archive | Pass | No archive request before selecting a grant. Exact byte ranges returned 206. A separate 200-response test opened two grants with a single full compressed archive download. |
| Navigation and list parity | Pass | All seven beds match in field, bed and list view. The same order, scores or neutral flag, deadlines and source URLs appear in both views. Entry uses a 600 ms camera transition and Back uses 500 ms. Layer settings, filter and entry focus survived the round trip. |
| Keyboard | Pass | Enter opened all seven beds. Sequential Tab presses reached all 769 plants in the expected order. Escape from the detail panel restored the selected plant's focus. |
| Mobile layout and largest record | Pass in mobile emulation | All 769 plants fit the field. The Galaxy A55 touch profile opened `gg-360368`, the largest record, in 2.50 s on the local test server. The panel showed all 55,509 linked papers in its count and rendered the first 100 URLs on expansion. |
| Pricing and marketing | Pass | The marketing markup from the hero through the footer and the Ask demo logic match preview commit `5c8b25b` byte-for-byte. All five `$99` strings and 12 existing outside-garden links match. |
| Credentials | Pass | The application reads static local assets and the archive was scanned for raw-format API keys. |

The full export supplies per-grant details. The earlier preview's separately queried topic aggregates were dated to that earlier feed and are outside this snapshot.

## Level 1 performance

Both foreground Chromium samples ran for approximately eight seconds with all 769 markers mounted. The Galaxy A55 profile used 480 × 1040, device pixel ratio 2.25 and 4× CPU throttling. It represents a browser emulation profile.

| Profile | Average fps | p95 frame interval | Target |
| --- | ---: | ---: | --- |
| Desktop, 1440 × 900 | 60.00 | 16.7 ms | Passed |
| Galaxy A55 emulation, 4× CPU | 57.88 | 16.8 ms | Below 60 fps |

The phone lost frames to renderer and compositor work. A separate three-second phone trace measured 2,493.85 ms in renderer-main tasks and 796.39 ms in compositor/raster tasks, with 128.75 ms in JavaScript function callbacks. The uninstrumented performance sample recorded zero layout work and 3.02% of frame intervals above 22 ms. The inclusive trace timers on different threads can overlap. On the reduced quality setting, the garden draws fewer particles and limits canvas repaint cadence to about 30 Hz. Every plant stays mounted.

[Browser measurements and 17 record comparisons](full-feed-browser.json) · [Keyboard sweep and largest detail](full-feed-keyboard.json) · [Desktop screenshot](full-field-desktop.png) · [Mobile screenshot](full-field-mobile.png)
