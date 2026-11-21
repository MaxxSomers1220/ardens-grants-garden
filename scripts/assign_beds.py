#!/usr/bin/env python3
"""Assign source-backed feed records to Arden's topical beds.

Scores describe the feed's research evidence and only affect ordering within
each bed. Topic assignment uses explicit phrases in the grant title and the
opening of its Grants.gov synopsis.
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
        r"rare neurologic(?:al)? and neuromuscular (?:diseases?|disorders?)",
        r"orphan (?:diseases?|conditions?|drugs?|products?)",
    )),
    ("neuro", "Neuroscience", (
        r"neuroscien\w*|neurobiolog\w*|neurobehavior\w*|neurodegenerati\w*|neurodevelopment\w*",
        r"neuroimag\w*|neuropsych\w*|neurotherapeutic\w*|neuromodulat\w*|neurostimulat\w*",
        r"neurologists?|neurologic(?:al)? (?:or neuromuscular )?(?:diseases?|disorders?|conditions?|research|mechanisms?|outcomes?)",
        r"neuronal|neural (?:circuits?|circuitry|activity|development|ensembles?)|translational neural devices",
        r"brains?|spinal cords?|cerebral|nervous systems?",
        r"alzheimer(?:'?s)?|parkinson(?:'s)?|dementias?|epileps\w*|strokes?",
    )),
    ("cancer", "Cancer", (
        r"cancers?|oncolog\w*|tumou?rs?(?! necrosis factors?\b)|neoplas\w*",
        r"carcinomas?|carcinogens?|leuk(?:e|ae)mias?|lymphomas?|melanomas?|glioblastomas?|metastas\w*",
        r"hematologic(?:al)? malignanc(?:y|ies)|gliomas?|sarcomas?|neuroblastomas?",
    )),
    ("climate", "Climate & energy", (
        r"climate[- ](?:chang\w*|variabil\w*|adapt\w*|resilien\w*|science|model\w*|mitigat\w*|risk\w*|impacts?|solutions?)",
        r"decarboni\w*|greenhouse gas(?:es)?|carbon sequestration|carbon stewardship|low[- ]carbon",
        r"(?:renewable|clean|sustainable|solar|wind|nuclear) energy",
        r"energy (?:storage|systems?|efficien\w*|technolog\w*|infrastructur\w*)",
        r"bioenergy|geothermal|alternative (?:jet )?fuels?|fossil fuels?|(?:electric|power) grids?|solar power|wind power",
        r"carbon dioxide removal|offshore wind|photovoltaics?|university nuclear leadership program",
        r"nuclear fuel rods?|alternative chemicals,? fuels,? and feedstocks|energy and trade security",
    )),
    ("ai", "AI & data science", (
        r"artificial intelligence|augmented intelligence|(?:machine|deep|statistical) learning",
        r"data scien\w*|data analytics|data mining|big data|computer vision",
        r"(?:research|scientific|biomedical) data (?:commons|infrastructur\w*)",
        r"large language models?|(?:generative|responsible|trustworthy|explainable|applied|with|using) ai",
        r"ai[- ](?:enabled|powered|driven|systems?|models?|research|infrastructure|readiness|ready|development|education|for)",
        r"computational (?:modeling and analysis of the impact of genomic variation|genomics)",
        r"(?:grants?|research|methods?|resources?) (?:for |in |on )?(?:clinical informatics|bioinformatics)",
        r"computational and data[- ]enabled science|integrated data systems (?:and|&) services",
        r"automated processes for knowledge discovery and information retrieval",
    )),
    ("infectious", "Infectious disease", (
        r"(?:infectious|communicable) diseases?|infections?|disease outbreaks?|pandemics?",
        r"(?:antimicrobial|antibiotic) resistance|antivirals?|vaccines?|vaccination",
        r"(?:viral|bacterial|fungal|parasitic) diseases?|(?:disease|human|animal|zoonotic|viral|bacterial) pathogens?|host[- ]pathogens?",
        r"tuberculosis|hiv(?:/aids)?|aids research|covid(?:-19)?|malaria|hepatitis|influenza|ebola",
        r"animal disease preparedness(?: and response)?|human virome",
    )),
    ("earth", "Earth & environment", (
        r"earth sciences?|geolog\w*|geophysic\w*|geochem\w*|geo(?:sphere|sciences?)|cryosphere|hydrosphere",
        r"atmospheric sciences?|atmosphere|cooperative ecosystems? studies|ocean (?:science|drilling|research|mapping)",
        r"coastal (?:resilien\w*|habitats?|management|flood protection)|watersheds?|wetlands?|landslide\w*",
        r"water (?:resources?|research|conservation|pollution|quality)|water[- ]use (?:data|estimation)",
        r"environmental (?:monitoring|research|media|pollution|restoration|quality)|brownfields?|air pollution|pfas",
        r"flood (?:mitigation|management|risk)|ecosystem (?:restoration|management|science|conserv\w*)",
        r"ecological (?:research|restoration|monitoring)|stream (?:restoration|flow)|biodiversity conservation",
        r"marine (?:science|ecosystems?|protected areas?)|wildlife (?:habitats?|conserv\w*|management)|fish passage",
        r"oceanographic (?:facilities|research)|oceanic and atmospheric research",
        r"aquatic invasive species|aquatic nuisance species|landscape[- ]scale restoration",
        r"desalination (?:construction|projects?|technolog\w*)|water reclamation and reuse",
        r"marine mammal (?:rescue|rescue and response)|forest and open space conservation|diesel emissions reduction",
        r"contaminated (?:alaska native claims settlement act lands|lands?|sites?)|solid waste management",
    )),
    ("engineering", "Science & engineering", (
        r"mathematics(?! education)|mathematical sciences?|statistics|statistical science|combinatorics|(?:abstract |linear )?algebra",
        r"differential equations?|number theory|(?:geometry|topology|probability) (?:research|theory|and)",
        r"physics|chemistry|chemical sciences?|electrochemistry|photochemistry|molecular spectroscopy",
        r"chemical (?:synthesis|reaction|process)(?:es|ing)?|transport phenomena|simulation and modeling",
        r"robotics|materials (?:research|science|engineering|design)|manufacturing|semi[- ]?conductors?",
        r"(?:civil|mechanical|chemical|electrical|structural|systems|industrial|aerospace) engineering",
        r"engineering (?:research|design|science|materials|innovation|education centers?)",
        r"engineering (?:and|of) (?:computer|material|cell|biological|civil)\w*|nanotechnolog\w*|microelectronics",
        r"computing|computer science|cyberinfrastructure|cybersecurity|cyber[- ]physical systems?",
        r"secure open[- ]source|programming languages?|quantum (?:information|computing|science|systems?|materials?|technolog\w*)",
        r"aerothermoelasticity|aerospace capabilities,? engineering and research|research in the formation of engineers",
        r"foundations of trusted systems|chemical, bioengineering, energy,? and transport systems",
        r"directed energy \(rd\) university assistance",
    )),
    ("education", "Education & workforce", (
        r"(?:stem|science|mathematics|marine|tribal|undergraduate|graduate|special|environmental|secondary|bilingual|adult|career and technical) education",
        r"education (?:research|innovation|program for|partnerships?|and workforce|grants program)",
        r"early childhood (?:education|development)|teaching and learning|k[-– ]12|prek[–-]12",
        r"teacher (?:preparation|training|professional development)|training for teachers|educator professional development",
        r"undergraduate (?:education|students|institutions|programs|scholarships|curriculum)|undergraduate[- ]focused institutions",
        r"graduate research opportunities|curriculum development|workforce (?:development|training|education|readiness)",
        r"tribal colleges and universities program|community college workforce|schools and school districts|scholarships?",
        r"(?:digital|financial|scientific|adult) literacy|research experiences for (?:undergraduates|teachers)",
        r"scientific research workforce",
        r"graduate medical education|informal education (?:programs?|institutions?)",
        r"dislocated worker grants?|specialized education in critical technologies|graduate[- ]level internship program",
    )),
    ("careers", "Research careers", (
        r"(?:research )?career (?:development|enhancement|transition|excellence) (?:award|program)s?",
        r"early[- ]career (?:research(?:ers?| awards?)?|scientists?|investigators?)",
        r"(?:early[- ]stage|emerging|midcareer|new|outstanding|independent) (?:scientist|investigator) (?:research )?(?:award|program|research project grant)s?",
        r"pathway to independence award|research in residency|medical scientist training|clinical research scholar",
        r"(?:predoctoral|postdoctoral|individual senior|dissertation|research) fellowships?|fellowship for students",
        r"(?:institutional|predoctoral|postdoctoral|dual[- ]degree|undergraduate|graduate) (?:biomedical )?research training",
        r"predoctoral to postdoctoral transition award|national research service award|research training (?:and leadership|grants?|programs?)",
        r"research (?:education(?:al)?|mentoring) (?:programs?|networks?)",
        r"mentored (?:research|clinical scientist|quantitative research|research scientist) development award",
        r"academic career excellence(?: \(ace\))? award|mid[- ]career advancement|research software engineer(?: \(rse\))? award",
        r"small grant program for new investigators|maximizing investigators'? research award|epscor research fellows",
        r"emerging global leader award|transition to aging research|support for early[- ]career clinician[- ]scientists",
        r"graduate fellowship pilot|doctoral training pilots?",
    )),
    ("biomed", "Biomedical methods", (
        r"genomic (?:data generation|variants?|variation|interactions|characterization)|animal genomics|genome function",
        r"genetic architecture of complex human traits|structural biology|cryo[- ]electron (?:microscopy|tomography)",
        r"cellular senescence network|single[- ]cell (?:analysis|sequencing)|tissue engineering|biospecimens?",
        r"development of (?:animal )?models and related (?:biological )?materials|animal and biological material resource centers",
        r"bioengineering (?:research|partnerships)|biomedical technolog\w*|medical device (?:prototypes?|design|development)",
        r"biomarker validation|(?:in vivo|intravital|medical) imaging|imaging the olfactory system",
        r"clinical (?:and|&) translational (?:science|research)|translational science award",
        r"assay development|target identification and validation|shared instrumentation grant|seed instrumentation support",
        r"engineering biological and biomedical systems|clinical trial (?:pilot studies|(?:planning and )?implementation cooperative agreements?)",
        r"(?:clinical|data) coordinating center for multi[- ]site investigator[- ]initiated clinical trials",
        r"single[- ]site investigator[- ]initiated clinical trials|novel or greatly improved research tools and methods",
        r"translation of technologies for diagnosis and treatment|medtech translator|drugging the undruggable",
        r"precision probiotic therapies|(?:small molecules,? biologics,? and combination products)|instrumentation grant program",
        r"enabling technologies and transformative platforms for hlbs research|whole person health restoration",
    )),
    ("medicine", "Clinical medicine", (
        r"hematolog\w*|cardiovascular|heart failure|heart, lung, and blood disorders|hlbs disorders|diabetes",
        r"gastrointestinal|digestive diseases?|kidney (?:disease|disorders?|research)|urolog(?:y|ic(?:al)?)|renal (?:disease|disorders?)",
        r"arthritis|musculoskeletal (?:disease|disorders?|health)|down syndrome|newborn (?:screening|period)|screenable disorders in newborns",
        r"vision[- ]related|vision research|(?:hearing|auditory|vestibular|communication) disorders?",
        r"oral(?:[- ]systemic)? health|dental (?:health|diseases?|caries)|reproductive health|contraception|family planning services",
        r"immune tolerance network|congenital anomalies|human congenital|palliative care",
        r"craniofacial (?:conditions?|disorders?|diseases?)|generic (?:medicines|drugs?)|complex generics",
        r"analgesic (?:discovery|therapeutics)|pain research enhancement",
    )),
    ("publichealth", "Public health & safety", (
        r"public health (?:crisis|research|emergency|response|systems?|services?|infrastructur\w*|practice|preparedness|surveillance|interventions?)",
        r"occupational (?:safety|health)|construction safety|health services|maternal (?:and child )?health|community health",
        r"(?:child|family|population|environmental) health (?:outcomes|sciences|interventions)|health disparities|health ?care delivery",
        r"injury prevention|patient safety|worker safety|smoking cessation|nursing research|health surveillance",
        r"food (?:safety|defense) (?:systems?|testing|preparedness|standards)|(?:poisoning|exposure) prevention|health promotion",
        r"world trade center health program|native american health|native american research centers for health",
        r"dissemination and implementation research in health|health systems strengthening",
        r"strengthen(?:ing)? health systems|advancing global health|state process for informing consumers of recalls",
        r"human and animal food testing laboratories|laboratory flexible funding model|medical countermeasures",
    )),
    ("behavioral", "Mental health & addiction", (
        r"mental (?:health|disorders?|illness(?:es)?)|psychosis|psychiatric (?:conditions?|disorders?|interventions?)",
        r"psychotropic (?:drugs?|interventions?)|depressive disorders?|substance use",
        r"(?:drug|alcohol|opioid|tobacco) use (?:and misuse|disorders?)|(?:opioid|drug) overdose",
        r"addiction (?:research|epidemiology|prevention|treatment|recovery)|fetal alcohol spectrum disorders?",
        r"alcohol research centers?|suicide prevent\w*",
        r"psychotropic interventional drugs?|emotional well[- ]being mechanisms",
    )),
    ("civic", "Civic & community services", (
        r"human trafficking|trafficking in persons|anti[- ]trafficking|trafficking survivors|modern slavery",
        r"crime victims?|criminal justice|justice assistance|correctional|prisons?|law enforcement|school safety",
        r"reentry (?:programs?|initiatives?)|affordable housing|homeless housing|homelessness|children and families|domestic violence",
        r"economic development|community development|local technical assistance|community entrepreneurship|rural development",
        r"small business (?:innovation|research|development)|community capacity|community revitalization|ambassador's special self[- ]help",
        r"legal services|victim services|victim assistance|civil legal aid|(?:refugee|immigrant) (?:services|resettlement)",
        r"neighborhood (?:development|revitalization)",
        r"fair housing|resident opportunit(?:y|ies) and self[- ]sufficiency|unaccompanied (?:alien )?children|hud[- ]assisted housing",
        r"postconviction testing|missing and unidentified human remains|violent crime",
        r"elder abuse|abuse,? neglect,? and exploitation of elderly|child protection compact|integrity in american elections",
        r"social impact partnerships to pay for results|(?:long[- ]term )?economic recovery strategies|eda fy ?[0-9]{2} disaster supplemental",
        r"community service and volunteerism|americorps state and national competitive grants",
        r"state veterans home construction grant|outdoor recreation (?:legacy partnership|opportunit\w*)",
        r"adam walsh act|state criminal alien assistance program|special attorneys program|apex accelerator",
    )),
    ("defense", "Defense & security", (
        r"warfight\w*|national security|national defense|warfare|counter (?:weapons of mass destruction|chemical threats)",
        r"military (?:operations?|technolog\w*|capabilit\w*|readiness|medicine|health|threats?|personnel|research)",
        r"defense (?:industrial base|research|technology|science|sciences office|security cooperation|systems?|mission)",
        r"defense established program to stimulate competitive research",
        r"department of war (?:cyber service academy|(?:\(dow\) )?multidisciplinary research program)",
        r"(?:navy and marine corps|naval) (?:science and technology|operations?)|armed forces (?:capabilit\w*|readiness)",
        r"tactical (?:communications?|sensing|systems?)|army research (?:laboratory|institute)|army combat capabilities",
        r"air force (?:combat|operations|needs|requirements)|air force school of aerospace medicine",
        r"army applications lab|military academy broad agency announcement",
        r"research (?:interests of the united states air force academy|initiatives at the naval postgraduate school)",
        r"air force basic research sciences|extramural biomedical and human performance research and development department of defense",
        r"homeland security missions|geospatial intelligence|boosting innovative geoint",
    )),
    ("agriculture", "Agriculture & food", (
        r"cooperative agriculture|agriculture innovation centers?|agricultural (?:research|production|sciences|producers?)",
        r"specialty crops?|plant biotic interactions|plant genome research|designated new animal drugs|veterinary innovation centers?",
        r"food and agricultural sciences|dairy business innovation|meat and poultry processing|national school lunch program",
        r"bycatch reduction|(?:atlantic |sefsc )?bluefin tuna research|fisheries management|wolf livestock loss",
    )),
    ("heritage", "Arts & heritage", (
        r"arts and artifacts|(?:art|architecture) biennal(?:es?|s)|artist exchange|state arts agencies",
        r"public humanities|advancing the humanities|collections stewardship|national digital newspaper program",
        r"documenting endangered (?:human )?languages|cultural heritage preservation",
    )),
    ("society", "Social sciences", (
        r"science of organizations|accountable institutions and behavior|law (?:and|&) science",
        r"social psychology|social and behavio[u]?ral sciences?|social scientific studies of law",
        r"anthropolog\w*|archaeolog\w*|archaeometr\w*|linguistics|sociology",
        r"decision,? risk and management sciences|the economics program|^economics$",
        r"developmental sciences|measurement of language development|human[- ]environment and geographical sciences",
        r"a science of science approach|science of science: discovery",
    )),
    ("capacity", "Research infrastructure", (
        r"epscor research infrastructure improvement|established program to stimulate competitive research",
        r"research (?:infrastructure|capacity)[- ](?:improvement|building)",
        r"research capacity at (?:tribal colleges|historically black colleges and universities)",
        r"infrastructure innovation for biological research|research enhancement award program",
        r"support for research excellence|centers? of biomedical research excellence|biomedical research environment and sponsored programs administration",
        r"pediatric data resource center|kids first training and outreach core|resource[- ]related research projects",
        r"major research instrumentation program|findable accessible interoperable reusable open science",
        r"niams p30 centers program|research on research security program|research facilities act program",
        r"institutional review board establishment and enhancement|clinical research network infrastructure",
        r"state-of-the-art equipment, technologies, research tools",
    )),
    ("diplomacy", "Diplomacy & exchange", (
        r"public diplomacy programs?|commercial diplomacy|bilateral commercial cooperation|priorities in the multilateral sphere",
        r"u\.s\. policy at more than [0-9]+ international organizations",
        r"austrian[- ]american partnership fund|international development graduate fellowship",
        r"(?:foreign|international) affairs (?:graduate )?fellowship(?: program)?",
    )),
    (OTHER_ID, "Other opportunities", ()),
)
# Keep the existing tie precedence. The latest beds follow it in display order.
TIE_ORDER = ("rare", "cancer", "infectious", "neuro", "climate", "ai",
             "education", "careers", "earth", "engineering", "biomed", "medicine",
             "publichealth", "behavioral", "civic", "defense",
             "agriculture", "heritage", "society", "capacity", "diplomacy")
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
    r"National Institute of Allergy and Infectious Diseases|brain and/or body|"
    r"National Institute of Dental and Craniofacial Research|"
    r"National Science Foundation|Office of Naval Research|Army Research Office|"
    r"Air Force Office of Scientific Research|Department of Defense|Department of War|"
    r"Department of Education|Department of Agriculture|U\.S\. Geological Survey|"
    r"National Aeronautics and Space Administration|National Institute for Occupational Safety and Health|"
    r"National Institute on Drug Abuse|National Institute of Mental Health|"
    r"Office to Monitor and Combat Trafficking in Persons|National Institute of Arthritis and Musculoskeletal and Skin Diseases|"
    r"National Centers for Coastal Ocean Science|Public Health Service Act)\b",
    re.IGNORECASE,
)


def normalized(text):
    return " ".join(unicodedata.normalize("NFKC", text).replace("’", "'").split())


def opening_scope(record):
    source = normalized(record.get("description") or "")
    # Preserve the positions of actual evidence while excluding institution names
    # that would otherwise be partially visible at the cutoff.
    source = SYNOPSIS_CONTEXT.sub(lambda match: " " * len(match[0]), source)
    if len(source) > SYNOPSIS_CHARACTERS:
        source = source[:SYNOPSIS_CHARACTERS].rsplit(" ", 1)[0]
    return " ".join(
        ILLUSTRATIVE_CLAUSE.split(sentence, maxsplit=1)[0]
        for sentence in SENTENCE_BREAK.split(source)
    )


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
                    "title" if highest >= TITLE_POINTS else "opening_synopsis"
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
            "characters of the normalized Grants.gov synopsis. If no synopsis is available, "
            "only the title contributes. Each field earns points once per bed. The matching phrases "
            "below are case-insensitive, whole-word regular expressions, with case-sensitive "
            "exceptions for the listed title abbreviations. Named synopsis context is "
            "excluded without moving the 480-character boundary. Example-list tails are "
            "excluded. Highest score wins. The listed title tie order "
            "resolves equal title scores. Synopsis-only ties and records with no match go to "
            "Other opportunities. The original six beds and the ten beds added in the first "
            "split keep their display order. The second split appends topics supported by at "
            "least 10 of the 262 previously residual records. Records within each bed are sorted by descending "
            "gap score, ascending deadline with rolling last, then opportunity ID."
        ),
        "title_tie_order": list(TIE_ORDER),
        "matching_phrases": {
            bed: {
                "title_and_opening_synopsis": list(terms),
                **({"title_only_abbreviations": TITLE_ACRONYMS[bed].pattern}
                   if bed in TITLE_ACRONYMS else {}),
            }
            for bed, _, terms in BEDS if terms
        },
        "beds": [
            {"id": bed, "topic": title, "opportunity_ids": assignments[bed]}
            for bed, title, _ in BEDS
        ],
        "audit": {
            "assigned_title_match_count": supporting_fields["title"],
            "assigned_opening_match_count": supporting_fields["opening_synopsis"],
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
