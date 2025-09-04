"""
Partition a single Parquet file (e.g., IAV6-all.parquet) by the `protein`
column into a Hive-style dataset that DuckDB can partition-prune efficiently.

Outputs a directory tree like:

  <outdir>/
    protein=M1/part-00000.parquet
    protein=M2/part-00000.parquet
    ...

Usage (from repo root):

  python -m src.data.partition_iav6_by_protein \
    --input  src/data/IAV6-all.parquet \
    --outdir src/data/IAV6_partitioned

Optional flags:
  --compression zstd           (default: zstd)
  --row-group-size 500000      (rows per row group)
  --rows-per-file  2000000     (rows per output file)
  --only-proteins M1,HA,NA     (restrict to subset for a test run)
  --no-stats                   (skip pre/pass stats to reduce work)

Then, in DuckDB you can point a table or view to the dataset root and
benefit from partition pruning when querying with `WHERE protein = 'M1'`.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Iterable, Dict

import pyarrow as pa
import pyarrow.dataset as ds


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Partition a Parquet file by protein (Hive).")
    p.add_argument("--input", required=True, help="Path to input Parquet file (e.g., src/data/IAV6-all.parquet)")
    p.add_argument("--outdir", required=True, help="Output directory for the partitioned dataset")
    p.add_argument("--compression", default="zstd", help="Parquet compression codec (default: zstd)")
    p.add_argument("--row-group-size", type=int, default=500_000,
                   help="Max rows per row group (default: 500k)")
    p.add_argument("--rows-per-file", type=int, default=2_000_000,
                   help="Max rows per output file (default: 2M)")
    p.add_argument("--only-proteins", default=None,
                   help="Comma-separated protein IDs to include (e.g., M1,HA). If omitted, include all.")
    p.add_argument("--no-stats", action="store_true",
                   help="Skip pre-run protein counts (saves time for large files)")
    return p.parse_args()


def ensure_has_column(schema: pa.Schema, col: str) -> None:
    if col not in schema.names:
        raise SystemExit(f"Input file does not have required column: {col}")


def protein_counts(dataset: ds.Dataset, protein_field: str = "protein") -> Dict[str, int]:
    """Stream records to compute a rough count per protein without loading whole table."""
    counts: Dict[str, int] = {}
    scanner = ds.Scanner.from_dataset(dataset, columns=[protein_field])
    for batch in scanner.to_reader():
        col = batch.column(0)
        # Convert to Python values in chunks to avoid big allocations
        for i in range(len(batch)):
            v = col[i].as_py()
            if v is None:
                continue
            counts[v] = counts.get(v, 0) + 1
    return counts


def main() -> None:
    a = parse_args()

    input_path = Path(a.input)
    out_dir = Path(a.outdir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    print(f"[partition] Loading dataset from: {input_path}")
    dataset = ds.dataset(str(input_path), format="parquet")

    ensure_has_column(dataset.schema, "protein")

    # Optional subset filter for quick testing
    filter_expr = None
    if a.only_proteins:
        items = [s.strip() for s in a.only_proteins.split(",") if s.strip()]
        if items:
            filter_expr = ds.field("protein").isin(items)
            print(f"[partition] Restricting to proteins: {', '.join(items)}")

    if not a.no_stats:
        print("[partition] Computing per-protein counts (streaming)…")
        counts = protein_counts(dataset)
        if counts:
            top = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
            print("[partition] Proteins (top 20 by rows):")
            for k, v in top[:20]:
                print(f"  {k}: {v:,}")
            print(f"[partition] Total proteins: {len(counts)}")
        else:
            print("[partition] No non-null protein values found.")

    # Set Parquet writing options
    pq_format = ds.ParquetFileFormat()
    write_opts = pq_format.make_write_options(compression=a.compression, use_dictionary=True)

    # Create a scanner with an optional filter to limit proteins for a test run
    scanner = ds.Scanner.from_dataset(dataset, filter=filter_expr)

    print(f"[partition] Writing Hive-partitioned dataset to: {out_dir}")
    ds.write_dataset(
        data=scanner,
        base_dir=str(out_dir),
        format=pq_format,
        file_options=write_opts,
        # For Hive-style partitioning, provide a schema (not field_names)
        partitioning=ds.partitioning(
            schema=pa.schema([pa.field("protein", pa.string())]),
            flavor="hive",
        ),
        max_rows_per_group=a.row_group_size,
        max_rows_per_file=a.rows_per_file,
        existing_data_behavior="overwrite_or_ignore",
        use_threads=True,
    )

    # Show a quick hint for DuckDB usage
    print("[partition] Done. Example DuckDB usage:")
    print("  CREATE OR REPLACE VIEW proteins AS")
    print(f"    SELECT * FROM read_parquet('{out_dir.as_posix()}/protein=*/*.parquet');")
    print("  -- Now queries with WHERE protein = 'M1' prune partitions.")


if __name__ == "__main__":
    main()
