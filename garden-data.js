const INDEX_PATH = new URL("./data/feed-index.json", import.meta.url);
const ASSIGNMENTS_PATH = new URL("./data/bed-assignments.json", import.meta.url);
const ARCHIVE_PATH = new URL("./data/feed.json.gz", import.meta.url);

async function readJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error("Garden data request failed");
  return response.json();
}

function verifyIndex(index, assignments) {
  const records = new Map(index.opportunities.map(record => [record.opportunity_id, record]));
  if (index.version !== 1 || assignments.version !== 1 || records.size !== index.record_count ||
      index.opportunities.length !== index.record_count || assignments.record_count !== index.record_count ||
      assignments.feed_generated_at !== index.feed_generated_at) {
    throw new Error("Garden data files disagree about source generation or count");
  }

  for (const record of records.values()) {
    const [start, length] = record.range;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) ||
        start < 0 || length <= 0 || start + length > index.archive_size_bytes ||
        !/^https:\/\/(www\.)?grants\.gov\//.test(record.source_url)) {
      throw new Error("Invalid grant record index entry");
    }
  }

  const usedIds = new Set();
  const usedBeds = new Set();
  const beds = assignments.beds.map(({ id, topic, opportunity_ids, gap }) => {
    if (!/^[a-z]+$/.test(id) || usedBeds.has(id) || !topic) throw new Error("Invalid topic bed");
    usedBeds.add(id);
    const slots = opportunity_ids.map(recordId => {
      const record = records.get(recordId);
      if (!record || usedIds.has(recordId)) throw new Error("Invalid or duplicate bed assignment");
      usedIds.add(recordId);
      return record;
    });
    return { id, topic, gap, slots };
  });
  if (usedIds.size !== records.size) throw new Error("Some grants are missing from the field");
  return beds;
}

function readDetails(index) {
  let completeArchive;
  const archive = new URL(ARCHIVE_PATH);
  archive.searchParams.set("sha256", index.decompressed_sha256);

  async function readBytes(start, length, signal) {
    if (completeArchive) return new Uint8Array(completeArchive, start, length);

    const end = start + length - 1;
    const response = await fetch(archive, { signal, headers: { Range: "bytes=" + start + "-" + end } });
    if (response.status === 206) {
      const expected = "bytes " + start + "-" + end + "/" + index.archive_size_bytes;
      if (response.headers.get("Content-Range") !== expected) throw new Error("Unexpected grant archive range");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== length) throw new Error("Truncated grant archive range");
      return new Uint8Array(bytes);
    }
    if (response.status !== 200) throw new Error("Grant archive request failed");

    // A static host may ignore Range. Keep the compressed archive once and
    // decode only the requested record in either response mode.
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== index.archive_size_bytes) throw new Error("Unexpected grant archive size");
    completeArchive = bytes;
    return new Uint8Array(completeArchive, start, length);
  }

  return async function loadRecord(summary, signal) {
    const member = await readBytes(...summary.range, signal);
    const stream = new Blob([member]).stream().pipeThrough(new DecompressionStream("gzip"));
    const bytes = await new Response(stream).arrayBuffer();
    if (globalThis.crypto?.subtle) {
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const digest = Array.from(new Uint8Array(hash), part => part.toString(16).padStart(2, "0")).join("");
      if (digest !== summary.record_sha256) throw new Error("Grant record checksum does not match");
    }
    const record = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (record.opportunity_id !== summary.opportunity_id ||
        record.feed_generated_at !== index.feed_generated_at ||
        record.linked_awards?.length !== summary.linked_award_count ||
        record.linked_papers?.length !== summary.linked_paper_count) {
      throw new Error("Grant record does not match its field entry");
    }
    return record;
  };
}

export async function openGardenFeed() {
  const [index, assignments] = await Promise.all([readJson(INDEX_PATH), readJson(ASSIGNMENTS_PATH)]);
  return {
    feed_generated_at: index.feed_generated_at,
    record_count: index.record_count,
    source_file: index.source_file,
    beds: verifyIndex(index, assignments),
    loadRecord: readDetails(index)
  };
}
