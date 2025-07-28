#!/usr/bin/env python3
"""
Convert the big IEDB result CSV to Parquet (ZSTD), streaming in chunks.
"""

import os
import pyarrow as pa
import pyarrow.csv as pc
import pyarrow.parquet as pq

# ── Paths ───────────────────────────────────────────────────────────
INPUT_CSV  = r"C:\Users\mcjen\Documents\GitHub\immunopeptidomics\src\data\iedb_netmhcpan_30k_allalleles_results.csv"
OUTPUT_PARQUET = os.path.splitext(INPUT_CSV)[0] + ".parquet"

# ── Tunables ────────────────────────────────────────────────────────
COMPRESSION     = "ZSTD"
ROW_GROUP_SIZE  = 1_000_000          # rows per row group in parquet
BLOCK_SIZE      = 1 << 26            # 64 MB CSV read blocks

def main():
    if not os.path.exists(INPUT_CSV):
        raise FileNotFoundError(INPUT_CSV)

    read_opts    = pc.ReadOptions(block_size=BLOCK_SIZE, use_threads=True)
    parse_opts   = pc.ParseOptions(delimiter=",")
    convert_opts = pc.ConvertOptions(auto_dict_encode=True)

    reader = pc.open_csv(INPUT_CSV,
                         read_options=read_opts,
                         parse_options=parse_opts,
                         convert_options=convert_opts)

    writer = None
    total = 0
    for batch in reader:
        table = pa.Table.from_batches([batch])
        total += table.num_rows
        if writer is None:
            writer = pq.ParquetWriter(OUTPUT_PARQUET, table.schema,
                                      compression=COMPRESSION)
        writer.write_table(table, row_group_size=ROW_GROUP_SIZE)

    if writer is not None:
        writer.close()

    print(f"✔️  Wrote {total:,} rows → {OUTPUT_PARQUET}")

if __name__ == "__main__":
    main()
