#!/usr/bin/env python3
"""
Create a slim Parquet from the big IEDB CSV:
- Keep only: allele, peptide, netmhcpan_el_percentile, netmhcpan_ba_percentile
- Round EL/BA percentiles to 2 decimals
- Store EL/BA as float32 (saves space)
- Write ZSTD-compressed Parquet as iedb_netmhc_slim.parquet
"""

import os
import pyarrow as pa
import pyarrow.csv as pc            # CSV reader
import pyarrow.compute as pcx       # columnar compute
import pyarrow.parquet as pq

# ── Paths ───────────────────────────────────────────────────────────
INPUT_CSV = r"C:\Users\mcjen\Documents\GitHub\immunopeptidomics\src\data\iedb_netmhcpan_30k_allalleles_results.csv"
OUTPUT_PARQUET = os.path.join(os.path.dirname(INPUT_CSV), "iedb_netmhc_slim.parquet")

# ── Tunables ────────────────────────────────────────────────────────
COMPRESSION     = "ZSTD"
ROW_GROUP_SIZE  = 1_000_000          # rows per row group in parquet
BLOCK_SIZE      = 1 << 26            # 64 MB CSV read blocks
KEEP_COLS       = [
    "allele",
    "peptide",
    "netmhcpan_el_percentile",
    "netmhcpan_ba_percentile",
]

def main():
    if not os.path.exists(INPUT_CSV):
        raise FileNotFoundError(INPUT_CSV)

    read_opts = pc.ReadOptions(block_size=BLOCK_SIZE, use_threads=True)
    parse_opts = pc.ParseOptions(delimiter=",")
    convert_opts = pc.ConvertOptions(
        include_columns=KEEP_COLS,
        # Make sure types are what we want when possible (we'll cast again anyway)
        column_types={
            "allele": pa.string(),
            "peptide": pa.string(),
            "netmhcpan_el_percentile": pa.float32(),
            "netmhcpan_ba_percentile": pa.float32(),
        },
        auto_dict_encode=True,   # helps with string columns
    )

    reader = pc.open_csv(
        INPUT_CSV,
        read_options=read_opts,
        parse_options=parse_opts,
        convert_options=convert_opts,
    )

    writer = None
    total = 0

    for batch in reader:
        tbl = pa.Table.from_batches([batch])  # only KEEP_COLS are present
        total += tbl.num_rows

        # Round to 2 decimals and cast to float32 (if not already)
        el = pcx.cast(pcx.round(tbl["netmhcpan_el_percentile"], ndigits=2), pa.float32())
        ba = pcx.cast(pcx.round(tbl["netmhcpan_ba_percentile"], ndigits=2), pa.float32())

        slim = pa.table({
            "allele":  tbl["allele"],
            "peptide": tbl["peptide"],
            "netmhcpan_el_percentile": el,
            "netmhcpan_ba_percentile": ba,
        })

        if writer is None:
            writer = pq.ParquetWriter(
                OUTPUT_PARQUET,
                schema=slim.schema,
                compression=COMPRESSION,
                use_dictionary=["allele", "peptide"],  # force dict-encoding for strings
            )

        writer.write_table(slim, row_group_size=ROW_GROUP_SIZE)

    if writer is not None:
        writer.close()

    print(f"✔️  Wrote {total:,} rows → {OUTPUT_PARQUET}")

if __name__ == "__main__":
    main()
