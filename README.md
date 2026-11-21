# ardens-grants-garden
Arden's Grants Garden — interactive garden demo advertising Rigby's Cloud daily grants data feed

## Open the garden

Serve the repository over HTTP and open `index.html`. For a local preview:

```sh
python3 -m http.server 8000
```

The field reads the compact feed index and bed assignments. Grant details load
when opened from a byte range in `data/feed.json.gz`. Hosts without range
support send the compressed archive once on the first detail request. The
browser decompresses only the selected record in either case.

## Refresh the snapshot

Given a downloaded Rigby's Cloud gzip export, run these commands from the
repository root:

```sh
python3 scripts/pack_feed.py /path/to/rigbys-cloud-feed.json.gz
python3 scripts/assign_beds.py /path/to/rigbys-cloud-feed.json.gz
```

The packer verifies that the stored archive decompresses to the original JSON
bytes and validates every grant's range. The assignment script groups the same
IDs by explicit cues in their titles and opening source synopsis. Grants with
no clear match go to Other opportunities. Both views use the same bed order.

Publish the archive, feed index and bed assignments from the same generation
together. A future scheduled refresh can fetch the export with a server-side
paid credential, run these commands, and publish the resulting files. The
static garden opens those files directly.
