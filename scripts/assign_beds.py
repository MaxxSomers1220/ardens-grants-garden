#!/usr/bin/env python3
"""Assign source-backed feed records to Arden's topical beds.

Scores describe the feed's research evidence and only affect ordering within
each bed. Topic assignment uses explicit phrases in the grant title and the
opening of its Grants.gov synopsis, with the feed summary as a fallback.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import gzip
import json
from pathlib import Path
import re
import sys
from tempfile import NamedTemporaryFile
import unicodedata


SYNOPSIS_CHARACTERS = 480
TITLE_POINTS = 3
SYNOPSIS_POINTS = 1
OTHER_ID = "other"
BEDS = (
    ("rare", "Rare disease", (
        r"rare(?: (?:genetic|neurologic(?:al)?|neurodevelopmental|inherited))? (?:diseases?|disorders?|conditions?)",
        r"orphan (?:diseases?|conditions?|drugs?|products?)",
    )),
    ("neuro", "Neuroscience", (
        r"neuroscien\w*|neurobiolog\w*|neurobehavior\w*|neurodegenerati\w*|neurodevelopment\w*",
        r"neuroimag\w*|neuropsych\w*|neurotherapeutic\w*|neuromodulat\w*|neurostimulat\w*",
        r"neurologists?|neurologic(?:al)? (?:or neuromuscular )?(?:diseases?|disorders?|conditions?|research|mechanisms?|outcomes?)",
        r"neuronal|neural (?:circuits?|activity|development|ensembles?)",
        r"brains?|spinal cords?|cerebral|nervous systems?",
        r"alzheimer(?:'s)?|parkinson(?:'s)?|dementia|epileps\w*|strokes?",
    )),
    ("cancer", "Cancer", (
        r"cancers?|oncolog\w*|tumou?rs?(?! necrosis factors?\b)|neoplas\w*",
        r"carcinomas?|carcinogens?|leuk(?:e|ae)mias?|lymphomas?|melanomas?|glioblastomas?|metastas\w*",
    )),
    ("climate", "Climate & energy", (
        r"climate (?:chang\w*|variabil\w*|adapt\w*|resilien\w*|science|model\w*|mitigat\w*|risk\w*|impacts?|solutions?)",
        r"decarboni\w*|greenhouse gas(?:es)?|carbon sequestration|carbon stewardship|low[- ]carbon",
        r"(?:renewable|clean|sustainable|solar|wind|nuclear) energy",
        r"energy (?:storage|systems?|efficien\w*|technolog\w*|infrastructur\w*)",
        r"bioenergy|geothermal|alternative (?:jet )?fuels?|fossil fuels?|(?:electric|power) grids?|solar power|wind power",
    )),
    ("ai", "AI & data science", (
        r"artificial intelligence|augmented intelligence|(?:machine|deep|statistical) learning",
        r"data scien\w*|data analytics|data mining|big data|computer vision",
        r"(?:research|scientific|biomedical) data (?:commons|infrastructur\w*)",
        r"large language models?|(?:generative|responsible|trustworthy|explainable|applied|with|using) ai",
        r"ai[- ](?:enabled|powered|driven|systems?|models?|research|infrastructure|readiness|ready|development|education|for)",
    )),
    ("infectious", "Infectious disease", (
        r"(?:infectious|communicable) diseases?|infections?|disease outbreaks?|pandemics?",
        r"(?:antimicrobial|antibiotic) resistance|antivirals?|vaccines?|vaccination",
        r"(?:viral|bacterial|fungal|parasitic) diseases?|(?:disease|human|animal|zoonotic|viral|bacterial) pathogens?|host[- ]pathogens?",
        r"tuberculosis|hiv(?:/aids)?|aids research|covid(?:-19)?|malaria|hepatitis|influenza|ebola",
    )),
    (OTHER_ID, "Other opportunities", ()),
)
# Direct disease subjects take precedence over methods when equally supported.
TIE_ORDER = ("rare", "cancer", "infectious", "neuro", "climate", "ai")
PATTERNS = {
    bed: re.compile(r"\b(?:" + "|".join(terms) + r")\b", re.IGNORECASE)
    for bed, _, terms in BEDS if terms
}
TITLE_ACRONYMS = {
    "cancer": re.compile(r"\bNCI\b"),
    "neuro": re.compile(r"\b(?:NINDS|AD/ADRD|ADRD)\b"),
    "infectious": re.compile(r"\b(?:CFAR|D-CFAR)\b"),
}
SENTENCE_BREAK = re.compile(r"(?<!e\.g\.)(?<=[.!?])\s+", re.IGNORECASE)
ILLUSTRATIVE_CLAUSE = re.compile(
    r"\b(?:(?:such as|including,? but not limited to|including|for example)\b|e\.g\.)",
    re.IGNORECASE,
)
SYNOPSIS_CONTEXT = re.compile(
    r"\b(?:National Cancer Institute|National Institute of Neurological Disorders and Stroke|"
    r"National Institute of Allergy and Infectious Diseases|brain and/or body)\b",
    re.IGNORECASE,
)


def normalized(text):
    return " ".join(unicodedata.normalize("NFKC", text).replace("’", "'").split())


def opening_scope(record):
    description = normalized(record.get("description") or "")
    source = description or normalized(record.get("summary_short") or "")
    if len(source) > SYNOPSIS_CHARACTERS:
        source = source[:SYNOPSIS_CHARACTERS].rsplit(" ", 1)[0]
    plain_scope = " ".join(
        ILLUSTRATIVE_CLAUSE.split(sentence, maxsplit=1)[0]
        for sentence in SENTENCE_BREAK.split(source)
    )
    return SYNOPSIS_CONTEXT.sub(" ", plain_scope)


def match_beds(record):
    title = normalized(record["title_normalized"])
    opening = opening_scope(record)
    points_by_bed = {}
    for bed, pattern in PATTERNS.items():
        abbreviation = TITLE_ACRONYMS.get(bed)
        title_signal = pattern.search(title) or (abbreviation and abbreviation.search(title))
        points = TITLE_POINTS * bool(title_signal) + SYNOPSIS_POINTS * bool(pattern.search(opening))
        if points:
            points_by_bed[bed] = points
    return points_by_bed


def rank(record):
    deadline = record["deadline_parsed"]
    closing = (datetime.fromisoformat(deadline) if deadline is not None
               else datetime.max.replace(tzinfo=timezone.utc))
    return -record["gap_score"], closing, record["opportunity_id"]


def assign_beds(feed):
    records = feed["opportunities"]
    generated = feed["feed_generated_at"]
    timestamp = datetime.fromisoformat(generated)
    if (timestamp.tzinfo is None or type(feed["record_count"]) is not int
            or not 0 < feed["record_count"] == len(records)):
        raise ValueError("Feed timestamp or count is invalid")
    seen = set()
    assignments = {bed: [] for bed, _, _ in BEDS}
    supporting_fields = Counter()
    overlaps = []
    ambiguous_count = 0
    for record in sorted(records, key=rank):
        identifier = record["opportunity_id"]
        if (not re.fullmatch(r"gg-[0-9]+", identifier) or identifier in seen
                or record["feed_generated_at"] != generated
                or type(record["gap_score"]) is not int or not 0 <= record["gap_score"] <= 100):
            raise ValueError("Duplicate, invalid, or mismatched snapshot record")
        seen.add(identifier)
        matches = match_beds(record)
        chosen = OTHER_ID
        if matches:
            highest = max(matches.values())
            strongest = [bed for bed, points in matches.items() if points == highest]
            if len(strongest) > 1 and highest == SYNOPSIS_POINTS:
                ambiguous_count += 1
            else:
                chosen = min(strongest, key=TIE_ORDER.index)
                supporting_fields[
                    "title" if highest >= TITLE_POINTS else "opening_synopsis_or_summary"
                ] += 1
        if len(matches) > 1:
            overlaps.append({
                "opportunity_id": identifier, "assigned_bed": chosen,
                "matching_beds": matches,
            })
        assignments[chosen].append(identifier)
    if len(seen) != feed["record_count"]:
        raise ValueError("Unique records do not match the export count")
    return {
        "version": 1,
        "feed_generated_at": generated,
        "record_count": feed["record_count"],
        "method": (
            "Explicit topical phrases earn 3 points in the title and 1 in the first 480 "
            "characters of the Grants.gov synopsis, using the feed summary when the synopsis "
            "is absent. Explicit program abbreviations in titles also count. Synopsis agency "
            "names and example-list tails provide context only. Highest score wins. Strongest "
            "title ties follow the order rare disease, cancer, infectious disease, neuroscience, "
            "climate and energy, and AI and data science. Synopsis-only ties and records with "
            "no match go to Other opportunities. This is a garden grouping based on source text. "
            "Bed order uses descending gap score, ascending deadline with rolling last, and "
            "opportunity ID."
        ),
        "beds": [
            {"id": bed, "topic": title, "opportunity_ids": assignments[bed]}
            for bed, title, _ in BEDS
        ],
        "audit": {
            "assigned_title_match_count": supporting_fields["title"],
            "assigned_opening_match_count": supporting_fields["opening_synopsis_or_summary"],
            "unmatched_count": len(assignments[OTHER_ID]) - ambiguous_count,
            "ambiguous_opening_count": ambiguous_count,
            "overlap_count": len(overlaps),
            "overlaps": overlaps,
        },
    }


def write_assignment(output, assignment):
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, delete=False) as file:
        pending = Path(file.name)
        try:
            json.dump(assignment, file, ensure_ascii=False, indent=2)
            file.write("\n")
            file.flush()
            pending.replace(output)
        finally:
            pending.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path, help="Local gzip feed export")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1]
                        / "data" / "bed-assignments.json")
    arguments = parser.parse_args()
    with gzip.open(arguments.export, "rt", encoding="utf-8") as file:
        assignment = assign_beds(json.load(file))
    write_assignment(arguments.output, assignment)
    for bed in assignment["beds"]:
        print(f'{bed["topic"]}: {len(bed["opportunity_ids"])}', file=sys.stderr)


if __name__ == "__main__":
    main()
