#!/usr/bin/env python3
"""Pack a Rigby's Cloud export into an exact, record-range-addressable gzip."""

import argparse
from datetime import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit
import zlib


_READ_CHARS = 64 * 1024
_VERIFY_BYTES = 1024 * 1024
_JSON = json.JSONDecoder()
_WS = r'[ \t\r\n]*'
_HEADER = re.compile(
    _WS + r'\{' + _WS + r'"feed_generated_at"' + _WS + r':' + _WS
    + r'("(?:[^"\\]|\\.)*")' + _WS + r',' + _WS + r'"record_count"' + _WS
    + r':' + _WS + r'([1-9][0-9]*)' + _WS + r',' + _WS + r'"opportunities"'
    + _WS + r':' + _WS + r'\[' + _WS + r'(?=\{)'
)
_BETWEEN = re.compile(_WS + r',' + _WS + r'(?=\{)')
_END = re.compile(_WS + r'\]' + _WS + r'\}' + _WS)
_INDEX_FIELDS = (
    'opportunity_id', 'title_normalized', 'sponsor_normalized', 'deadline_parsed',
    'deadline_precision', 'award_amount_parsed', 'growth_score', 'momentum_score',
    'novelty_score', 'gap_score',
)


class _FeedReader:
    """Decode one JSON record at a time while retaining its original characters."""

    def __init__(self, source):
        self.source = source
        self.buffer = ''
        self.position = 0

    def framing(self, pattern, label):
        if match := pattern.match(self.buffer, self.position):
            self.position = match.end()
            return match
        self.buffer = self.buffer[self.position:] + self.source.read(_READ_CHARS)
        self.position = 0
        match = pattern.match(self.buffer)
        if match is None:
            raise ValueError(f'Invalid feed framing at {label}')
        self.position = match.end()
        return match

    def record(self, number):
        while True:
            try:
                value, end = _JSON.raw_decode(self.buffer, self.position)
                break
            except json.JSONDecodeError as error:
                pending = self.buffer[self.position:]
                more = self.source.read(max(_READ_CHARS, len(pending)))
                if not more:
                    raise ValueError(f'Invalid JSON in opportunity {number}: {error.msg}') from error
                self.buffer = pending + more
                self.position = 0
        text = self.buffer[self.position:end]
        self.position = end
        return value, text.encode('utf-8')

    def finish(self):
        suffix = self.buffer[self.position:] + self.source.read(_READ_CHARS)
        if _END.fullmatch(suffix) is None or self.source.read(1):
            raise ValueError('Feed does not end after the declared number of opportunities')
        return suffix.encode('utf-8')


def _timestamp(value):
    parsed = datetime.fromisoformat(value)
    if parsed.utcoffset() is None:
        raise ValueError('Feed timestamp must include its time zone')
    return parsed


def _index_record(record, generated_at, number):
    try:
        fields = {name: record[name] for name in _INDEX_FIELDS}
        if any(not isinstance(fields[name], str) or not fields[name]
               for name in ('opportunity_id', 'title_normalized', 'sponsor_normalized')):
            raise ValueError('missing ID, title, or sponsor')
        if _timestamp(record['feed_generated_at']) != generated_at:
            raise ValueError('record timestamp differs from the feed timestamp')
        url = next(ref['url'] for ref in record['source_refs']['title_normalized']
                   if ref.get('url'))
        parsed_url = urlsplit(url)
        if parsed_url.scheme != 'https' or not parsed_url.hostname:
            raise ValueError('the title source URL is invalid')
        awards = record['linked_awards']
        papers = record['linked_papers']
        if not isinstance(awards, list) or not isinstance(papers, list):
            raise ValueError('linked awards and papers must be lists')
        status = record['score_evidence']['status']
        if not isinstance(status, str) or not status:
            raise ValueError('missing score evidence status')
    except (AttributeError, KeyError, StopIteration, TypeError, ValueError) as error:
        raise ValueError(f'Invalid opportunity {number}: {str(error) or type(error).__name__}') from error

    return {**fields, 'score_evidence_status': status, 'linked_award_count': len(awards),
            'linked_paper_count': len(papers), 'source_url': url}


def _write_member(archive, raw):
    encoded = gzip.compress(raw, compresslevel=6, mtime=0)
    offset = archive.tell()
    archive.write(encoded)
    return [offset, len(encoded)]


def _write_archive(source, destination):
    # Disabling newline conversion keeps every LF/CR byte in the export intact.
    with gzip.open(source, 'rt', encoding='utf-8', newline='') as original, destination.open('wb') as packed:
        reader = _FeedReader(original)
        header = reader.framing(_HEADER, 'the snapshot header')
        timestamp, count = json.loads(header.group(1)), int(header.group(2))
        generated_at = _timestamp(timestamp)
        _write_member(packed, header.group(0).encode('utf-8'))
        opportunities = []
        found_ids = set()
        for number in range(1, count + 1):
            if number > 1:
                separator = reader.framing(_BETWEEN, f'opportunity {number}')
                _write_member(packed, separator.group(0).encode('utf-8'))
            record, raw = reader.record(number)
            index_record = _index_record(record, generated_at, number)
            opportunity_id = index_record['opportunity_id']
            if opportunity_id in found_ids:
                raise ValueError(f'Duplicate opportunity ID: {opportunity_id}')
            found_ids.add(opportunity_id)
            index_record['range'] = _write_member(packed, raw)
            index_record['record_sha256'] = hashlib.sha256(raw).hexdigest()
            opportunities.append(index_record)
        _write_member(packed, reader.finish())
    return timestamp, opportunities


def _verify_export(source, destination, opportunities):
    digest = hashlib.sha256()
    with gzip.open(source, 'rb') as original, gzip.open(destination, 'rb') as packed:
        while data := original.read(_VERIFY_BYTES):
            if data != packed.read(len(data)):
                raise ValueError('Packed gzip does not reproduce the source JSON byte-for-byte')
            digest.update(data)
        if packed.read(1):
            raise ValueError('Packed gzip has trailing decompressed bytes')

    with destination.open('rb') as packed:
        for item in opportunities:
            offset, length = item['range']
            packed.seek(offset)
            part = packed.read(length)
            if len(part) != length or hashlib.sha256(gzip.decompress(part)).hexdigest() != item['record_sha256']:
                raise ValueError(f'Record range failed verification for {item["opportunity_id"]}')
    return digest.hexdigest()


def pack_feed(source, output_dir):
    archive_path = output_dir / 'feed.json.gz'
    index_path = output_dir / 'feed-index.json'
    if source.resolve() in (archive_path.resolve(), index_path.resolve()):
        raise ValueError('The source and output files must be separate')
    with source.open('rb') as original:
        source_sha = hashlib.file_digest(original, 'sha256').hexdigest()
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.feed-', dir=output_dir) as temporary:
        staged_archive = Path(temporary) / archive_path.name
        staged_index = Path(temporary) / index_path.name
        timestamp, opportunities = _write_archive(source, staged_archive)
        decompressed_sha = _verify_export(source, staged_archive, opportunities)
        manifest = {
            'version': 1,
            'feed_generated_at': timestamp,
            'record_count': len(opportunities),
            'archive_size_bytes': staged_archive.stat().st_size,
            'source_file': source.name,
            'source_gzip_sha256': source_sha,
            'decompressed_sha256': decompressed_sha,
            'opportunities': opportunities,
        }
        staged_index.write_text(json.dumps(manifest, ensure_ascii=False, allow_nan=False,
                                           separators=(',', ':')) + '\n', encoding='utf-8')
        os.replace(staged_archive, archive_path)
        os.replace(staged_index, index_path)
    return manifest, index_path.stat().st_size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='source Rigby\'s Cloud JSON gzip export')
    parser.add_argument('--output-dir', type=Path, default=Path('data'))
    args = parser.parse_args()
    try:
        manifest, index_bytes = pack_feed(args.source, args.output_dir)
    except (EOFError, OSError, ValueError, zlib.error) as error:
        parser.error(str(error))
    print(f'Packed and verified {manifest["record_count"]:,} records from {manifest["feed_generated_at"]}.')
    print(f'Archive {manifest["archive_size_bytes"]:,} bytes · Index {index_bytes:,} bytes')
    print(f'Source decompressed SHA-256 {manifest["decompressed_sha256"]}')


if __name__ == '__main__':
    main()
