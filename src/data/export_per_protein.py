"""
Export a single Parquet file (e.g., IAV6-all.parquet) into one file per
protein for simple HTTPFS access (no remote globbing).

- Reads once from the input Parquet using DuckDB.
- Writes per-protein Parquet to the specified outdir, e.g.:
    dist/data/iav6/protein/NP.parquet
    dist/data/iav6/protein/HA.parquet
    ...
- Emits an index.json with row counts and file sizes for UI use.

Usage (from repo root):

  python -m src.data.export_per_protein \
    --input  src/data/IAV6-all.parquet \
    --outdir dist/data/iav6/protein

Optional flags:
  --protein-column protein    (override if different)
  --compression zstd          (duckdb parquet compression)
  --only-proteins M1,HA,NA    (limit to subset for a quick run)

Notes:
- The outdir is created if missing. Existing files are overwritten.
- Filenames are derived from the protein value and sanitized to simple
  "A-Z, a-z, 0-9, _, -" characters.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import List, Dict, Any

import duckdb  # type: ignore


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Export one Parquet per protein for HTTPFS usage.")
    p.add_argument("--input", required=True, help="Path to input Parquet (e.g., src/data/IAV6-all.parquet)")
    p.add_argument("--outdir", required=True, help="Output directory for per-protein Parquet files")
    p.add_argument("--protein-column", default="protein", help="Protein column name (default: protein)")
    p.add_argument("--compression", default="zstd", help="Parquet compression (default: zstd)")
    p.add_argument("--only-proteins", default=None,
                   help="Comma-separated protein IDs to include (e.g., M1,HA). If omitted, include all.")
    return p.parse_args()


SAFE_NAME = re.compile(r"[^A-Za-z0-9_\-]+")


def sanitize_filename(value: str) -> str:
    """Sanitize protein value for use as a filename."""
    v = value.strip()
    if not v:
        v = "unknown"
    v = SAFE_NAME.sub("_", v)
    return v


def distinct_proteins(con: duckdb.DuckDBPyConnection, input_path: str, col: str, only: List[str] | None) -> List[str]:
    if only:
        return only
    q = f"SELECT DISTINCT {col} AS protein FROM read_parquet(?) WHERE {col} IS NOT NULL ORDER BY {col}"
    rows = con.execute(q, [input_path]).fetchall()
    return [str(r[0]) for r in rows]


def row_counts(con: duckdb.DuckDBPyConnection, input_path: str, col: str, proteins: List[str]) -> Dict[str, int]:
    # Efficient single pass grouped counts
    placeholders = ', '.join(['?'] * len(proteins))
    q = (
        f"SELECT {col} AS protein, COUNT(*) AS n "
        f"FROM read_parquet(?) WHERE {col} IN ({placeholders}) GROUP BY {col}"
    )
    rows = con.execute(q, [input_path, *proteins]).fetchall()
    return {str(r[0]): int(r[1]) for r in rows}


def export_one(
    con: duckdb.DuckDBPyConnection,
    input_path: str,
    col: str,
    protein: str,
    outdir: Path,
    compression: str,
) -> Path:
    safe = sanitize_filename(protein)
    out_path = outdir / f"{safe}.parquet"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Use COPY to write a single Parquet file filtered by protein.
    # DuckDB does not support parameter placeholders for the TO path.
    # We parameterize the input path and protein, but inline the output path as a literal.
    out_literal = out_path.as_posix().replace("'", "''")
    q = (
        f"COPY (SELECT * FROM read_parquet(?) WHERE {col} = ?) "
        f"TO '{out_literal}' (FORMAT PARQUET, COMPRESSION '{compression}')"
    )
    con.execute(q, [input_path, protein])
    return out_path


def write_index(outdir: Path, meta: List[Dict[str, Any]]) -> None:
    index_path = outdir / "index.json"
    with index_path.open("w", encoding="utf-8") as f:
        json.dump({
            "proteins": meta,
            "version": 1
        }, f, indent=2)


def main() -> None:
    a = parse_args()
    input_path = Path(a.input)
    outdir = Path(a.outdir)

    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    outdir.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect()
    # Configure threads: try 'auto' (newer DuckDB), fallback to CPU count.
    try:
        con.execute("PRAGMA threads=auto")
    except Exception:
        n = os.cpu_count() or 4
        if n < 1:
            n = 4
        con.execute(f"PRAGMA threads={n}")

    only = None
    if a.only_proteins:
        only = [s.strip() for s in a.only_proteins.split(',') if s.strip()]

    print(f"[export] Scanning distinct proteins from: {input_path}")
    proteins = distinct_proteins(con, str(input_path), a.protein_column, only)
    if not proteins:
        print("[export] No proteins found; exiting.")
        return
    print(f"[export] Found {len(proteins)} proteins")

    print("[export] Computing row counts (grouped)")
    counts = row_counts(con, str(input_path), a.protein_column, proteins)

    meta: List[Dict[str, Any]] = []
    for i, p in enumerate(proteins, 1):
        print(f"[export] ({i}/{len(proteins)}) writing {p}")
        path = export_one(con, str(input_path), a.protein_column, p, outdir, a.compression)
        size = path.stat().st_size if path.exists() else 0
        meta.append({
            "protein": p,
            "file": path.name,
            "rows": int(counts.get(p, 0)),
            "bytes": int(size),
        })

    print("[export] Writing index.json")
    write_index(outdir, meta)
    print(f"[export] Done. Files in: {outdir}")


if __name__ == "__main__":
    main()
