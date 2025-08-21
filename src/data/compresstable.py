#!/usr/bin/env python3
"""
Create a slim Parquet from peptide_table.parquet:
- Keep only: "seq #", "peptide length", allele, peptide, start, "end",
             "netmhcpan_el percentile", "netmhcpan_ba percentile"
- Round EL/BA percentiles to 2 decimals
- Store EL/BA as float32 (saves space)
- Store integer coords as int32 (or int16 where safe)
- Dictionary-encode strings (allele, peptide)
- Write ZSTD-compressed Parquet as peptide_table_slim.parquet
"""

import os
import sys
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.parquet as pq

# ── Paths (hardcoded) ──────────────────────────────────────────────
INPUT_PARQUET  = r"C:\Users\mcjen\Documents\GitHub\immunopeptidomics\src\data\peptide_table.parquet"
OUTPUT_PARQUET = os.path.join(os.path.dirname(INPUT_PARQUET), "peptide_table_slim.parquet")

# ── Tunables ───────────────────────────────────────────────────────
COMPRESSION     = "ZSTD"
ROW_GROUP_SIZE  = 1_000_000
BATCH_SIZE      = 262_144  # rows per batch from the scanner

# ── Columns we actually use (as referenced in your notebook) ──────
KEEP_COLS = [
    "seq #",
    "peptide length",
    "allele",
    "peptide",
    "start",
    "end",
    "netmhcpan_el percentile",
    "netmhcpan_ba percentile",
]

# Target schema (preserves original column names)
TARGET_SCHEMA = pa.schema([
    pa.field("seq #", pa.int32()),
    pa.field("peptide length", pa.int16()),
    pa.field("allele", pa.string()),
    pa.field("peptide", pa.string()),
    pa.field("start", pa.int32()),
    pa.field("end", pa.int32()),
    pa.field("netmhcpan_el percentile", pa.float32()),
    pa.field("netmhcpan_ba percentile", pa.float32()),
])

def slim_batch_to_table(batch: pa.RecordBatch) -> pa.Table:
    """Select, cast and round columns from a RecordBatch → slim Table."""
    tbl = pa.Table.from_batches([batch])
    cols = {name: tbl[name] for name in KEEP_COLS}

    # Cast numerics
    seq_col   = pc.cast(cols["seq #"], pa.int32())
    len_col   = pc.cast(cols["peptide length"], pa.int16())
    start_col = pc.cast(cols["start"], pa.int32())
    end_col   = pc.cast(cols["end"], pa.int32())

    # Strings
    allele  = pc.cast(cols["allele"], pa.string())
    peptide = pc.cast(cols["peptide"], pa.string())

    # Round → float32
    el = pc.cast(pc.round(pc.cast(cols["netmhcpan_el percentile"], pa.float64()), ndigits=2), pa.float32())
    ba = pc.cast(pc.round(pc.cast(cols["netmhcpan_ba percentile"], pa.float64()), ndigits=2), pa.float32())

    slim = pa.table({
        "seq #": seq_col,
        "peptide length": len_col,
        "allele": allele,
        "peptide": peptide,
        "start": start_col,
        "end": end_col,
        "netmhcpan_el percentile": el,
        "netmhcpan_ba percentile": ba,
    }, schema=TARGET_SCHEMA)

    return slim

def main():
    if not os.path.exists(INPUT_PARQUET):
        print(f"❌ Input not found: {INPUT_PARQUET}", file=sys.stderr)
        sys.exit(1)

    dataset = ds.dataset(INPUT_PARQUET, format="parquet")

    missing = [c for c in KEEP_COLS if c not in dataset.schema.names]
    if missing:
        print("❌ Missing expected columns in input Parquet:", ", ".join(missing), file=sys.stderr)
        sys.exit(2)

    scanner = dataset.scanner(columns=KEEP_COLS, batch_size=BATCH_SIZE, use_threads=True)

    writer = None
    total_rows = 0

    for batch in scanner.to_batches():
        slim_tbl = slim_batch_to_table(batch)
        total_rows += slim_tbl.num_rows

        if writer is None:
            writer = pq.ParquetWriter(
                OUTPUT_PARQUET,
                schema=TARGET_SCHEMA,
                compression=COMPRESSION,
                use_dictionary=["allele", "peptide"],  # dictionary-encode string cols
            )

        writer.write_table(slim_tbl, row_group_size=ROW_GROUP_SIZE)

    if writer is not None:
        writer.close()

    print(f"✔️ Wrote {total_rows:,} rows → {OUTPUT_PARQUET}")

if __name__ == "__main__":
    main()
