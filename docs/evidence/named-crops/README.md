# Arden’s named crops verification

The garden displays the Nov. 21, 2026 snapshot generated at `2026-11-21T06:00:54.859651+00:00`. All three files in `data/` are byte-for-byte identical to `main` at `7ca3d4a`. The browser found 769 distinct opportunities in 22 beds, each in its assigned bed and source order. Other opportunities holds 77 and Rare disease holds six. [Browser checks and counts for all 22 beds](acceptance.json)

| Crop model | Topic bed | Opportunities |
| --- | --- | ---: |
| Mind Plant | Neuroscience | 42 |
| Mind Plant | Mental health & addiction | 30 |
| Data Plant | AI & data science | 17 |
| Science Plant | Science & engineering | 44 |
| Medicine Plant | Clinical medicine | 36 |
| Art Plant | Arts & heritage | 12 |
| Rare Plant | Rare disease | 6 |
| Germ Plant | Infectious disease | 25 |
| Health Plant | Public health & safety | 34 |

| Check | Result | Evidence |
| --- | --- | --- |
| Model assignment and grant encoding | Pass | All 769 placements matched the export’s original growth states, neutrality, deadline window and order. The 13 remaining beds kept their existing crop models apart from the elephant toothpaste slot. Each bed had one elephant toothpaste plant. Eight beds use the highest non-neutral gap score, with source order for ties. The 14 beds with entirely neutral scores use the first grant as the landmark and keep its pale neutral styling. |
| Mobile geometry | Pass | All 22 labels cleared the plants, soil and adjacent labels at 320, 360, 390, 430, 768, 1024 and 1440 CSS px. All label centers matched their bed’s hit target. The phone captures use a 390 × 844 touch viewport. |
| Bed and plant interaction | Pass | Touch preview dismissed on outside tap. The second tap opened the matching grant, and close restored the selected plant’s focus. Ten grant panels showed the exact field-guide text across all eight models and two elephant toothpaste slots. The Neuroscience lead grant’s six award URLs and 50 paper URLs matched the source archive. |
| Keyboard, reduced motion and list view | Pass | Tab and Enter reached all 22 beds and 769 plants with a visible focus state. The reduced-motion pass observed zero active garden animations and restored both weather toggles after returning to the field. Every list row matched its field position, original title, gap value or neutral flag, and Grants.gov URL. [Keyboard results](keyboard.json) |

[Whole field on phone](phone-field.png) · [Neuroscience bed on phone](phone-neuroscience.png) · [Mind Plant field guide and grant detail](phone-detail.png)

## Level 1 frame rate

The Chromium samples each used an approximately eight-second foreground window after 1.6 seconds of warmup. Both profiles held all 769 plants in view. The Galaxy A55 profile is browser emulation with a 480 × 1040 CSS viewport, DPR 2.25 and 4× CPU slowdown. [Raw timings and diagnostic traces](timings.json)

| Profile | User-supplied earlier FPS | Fresh `main` FPS | Named crops FPS | Named crops p95 frame interval | 60 FPS target |
| --- | ---: | ---: | ---: | ---: | --- |
| Desktop, 1440 × 900 | 52.52 | 57.01 | 56.38 | 16.8 ms | Below target |
| Galaxy A55 emulation, 4× CPU | 27.09 | 52.89 | 57.14 | 16.8 ms | Below target |

The existing quality control reduced particles and slowed Canvas repaints in both named-crop samples. The separate three-second traces found compositor tasks as long as 44.4 ms on desktop and renderer-main tasks as long as 33.0 ms on the phone profile. Neither timed sample performed layout. The focused plant's sway settings are unchanged.
