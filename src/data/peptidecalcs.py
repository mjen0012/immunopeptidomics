#!/usr/bin/env python3
"""
Generate peptides at freq_all >= 30k (exclude HA, NA) and submit to IEDB Next‑Gen
API for NetMHCpan 4.1 EL & BA across multiple alleles, in batches.

Outputs:
  - peptides_30k_8-14.csv                      (generated peptide list)
  - iedb_netmhcpan_30k_allalleles_results.csv  (growing results file)
"""

import csv
import json
import math
import time
from pathlib import Path
from typing import List, Tuple

import itertools
import pandas as pd
import requests


# ───────────────────────── CONFIG ─────────────────────────
FREQ_PARQUET   = Path(r"C:\Users\mcjen\Documents\GitHub\immunopeptidomics\src\data\IAV8_sequencecalc.parquet")

PEPTIDE_OUT    = Path(r"C:\Users\mcjen\Documents\GitHub\immunopeptidomics\src\data\peptides_30k_8-14.csv")
RESULTS_OUT    = Path(r"C:\Users\mcjen\Documents\GitHub\immunopeptidomics\src\data\iedb_netmhcpan_30k_allalleles_results.csv")

THRESHOLD      = 30_000
EXCLUDE_PROTS  = {"HA", "NA"}
LENGTHS        = list(range(8, 15))  # 8–14

ALLELES = [
"HLA-A*34:01","HLA-B*15:02","HLA-B*18:01","HLA-B*35:03","HLA-C*04:01",
"HLA-E*01:01","HLA-E*01:03"
]
ALLELES_STR = ",".join(ALLELES)

PREDICTORS = [
    {"type": "binding", "method": "netmhcpan_el"},
    {"type": "binding", "method": "netmhcpan_ba"}
]

API_PIPELINE_URL = "https://api-nextgen-tools.iedb.org/api/v1/pipeline"
API_RESULTS_URL  = "https://api-nextgen-tools.iedb.org/api/v1/results"  # + /{result_id}

BATCH_SIZE    = 1_000    # peptides per API call
POLL_INTERVAL = 30       # seconds
MAX_RETRIES   = 3
TIMEOUT_SEC   = 30
# ──────────────────────────────────────────────────────────


# ─────────────── peptide generation (freq >= 30k) ────────────────
def generate_peptides(freq_df: pd.DataFrame,
                      lengths: List[int],
                      thr: int,
                      exclude: set) -> pd.DataFrame:
    """Return DataFrame of peptides (protein, peptide_len, start, end, peptide)."""

    rows = []

    # filter early
    filt = (
        (freq_df["frequency_all"] >= thr) &
        (freq_df["aminoacid"] != "-") &
        (~freq_df["protein"].isin(exclude))
    )
    df = freq_df[filt]

    for protein, grp in df.groupby("protein", sort=False):
        pos2aas = (
            grp.groupby("position")["aminoacid"]
               .apply(lambda s: list(s.unique()))
               .to_dict()
        )
        positions = sorted(pos2aas.keys())
        if not positions:
            continue

        for k in lengths:
            if len(positions) < k:  # too short
                continue
            for i in range(len(positions) - k + 1):
                window = positions[i:i + k]
                # build cartesian product of AA lists
                aa_lists = [pos2aas[p] for p in window]
                for combo in itertools.product(*aa_lists):
                    rows.append({
                        "protein":        protein,
                        "peptide_len":    k,
                        "start_position": window[0],
                        "end_position":   window[-1],
                        "peptide":        "".join(combo)
                    })

    out = (pd.DataFrame(rows)
           .drop_duplicates(subset=["protein", "peptide_len", "peptide"])
           .reset_index(drop=True))
    return out


# ──────────────── IEDB helpers ─────────────────────────
def fasta_from_sequences(seqs: List[str], start_index: int = 1) -> str:
    lines = []
    for idx, pep in enumerate(seqs, start=start_index):
        lines.append(f">{idx}\n{pep}")
    return "\n".join(lines)


def robust_request(method: str, url: str, **kwargs) -> requests.Response:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.request(method, url, timeout=TIMEOUT_SEC, **kwargs)
            if resp.status_code >= 500:
                raise requests.RequestException(f"HTTP {resp.status_code}")
            return resp
        except Exception as exc:
            if attempt == MAX_RETRIES:
                raise
            print(f"   ⚠️  {method.upper()} {url} failed ({exc}), retrying ({attempt}/{MAX_RETRIES}) …")
            time.sleep(2 ** attempt)


def submit_batch(peps: List[str], pep_len: int, batch_no: int,
                 alleles_str: str) -> Tuple[str, str]:
    fasta_text = fasta_from_sequences(peps)
    payload = {
        "pipeline_title": f"batch_{batch_no}_len_{pep_len}",
        "run_stage_range": [1, 1],
        "stages": [{
            "stage_number": 1,
            "tool_group": "mhci",
            "input_sequence_text": fasta_text,
            "input_parameters": {
                "alleles": alleles_str,
                "peptide_length_range": [int(pep_len), int(pep_len)],
                "predictors": PREDICTORS
            }
        }]
    }

    resp = robust_request(
        "post",
        API_PIPELINE_URL,
        headers={"accept": "application/json", "Content-Type": "application/json"},
        data=json.dumps(payload)
    )
    if resp.status_code != 200:
        raise RuntimeError(f"POST /pipeline failed: HTTP {resp.status_code} – {resp.text}")

    data = resp.json()
    print(f"   📨  Submitted batch {batch_no} (len={pep_len}, {len(peps):,} peptides) "
          f"→ result_id={data['result_id']}")
    return data["result_id"], data["pipeline_id"]


def poll_result(result_id: str) -> dict:
    url = f"{API_RESULTS_URL}/{result_id}"
    elapsed = 0
    while True:
        resp = robust_request("get", url, headers={"accept": "application/json"})
        data = resp.json()
        status = data.get("status", "unknown")
        if status == "done":
            return data
        if status not in ("pending", "running"):
            raise RuntimeError(f"Unexpected status for {result_id}: {status}")
        print(f"      ⏳  {result_id} still {status} … ({elapsed}s elapsed)")
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL


def extract_peptide_table(result_json: dict) -> Tuple[List[str], List[List]]:
    for entry in result_json["data"]["results"]:
        if entry["type"] == "peptide_table":
            cols = [c["name"] for c in entry["table_columns"]]
            rows = entry["table_data"]
            return cols, rows
    raise ValueError("peptide_table not found in result JSON")


# ───────────────────────── main ─────────────────────────
def main():
    t0 = time.time()

    # 1. Generate peptides (freq>=30k, exclude HA/NA)
    freq_df = pd.read_parquet(FREQ_PARQUET,
                              columns=["protein", "position", "aminoacid", "frequency_all"])
    pep_df = generate_peptides(freq_df, LENGTHS, THRESHOLD, EXCLUDE_PROTS)
    pep_df.to_csv(PEPTIDE_OUT, index=False)
    print(f"✔️  Generated {len(pep_df):,} peptides (@≥{THRESHOLD:,}) → {PEPTIDE_OUT.name}")

    # 2. Prepare output for results
    if RESULTS_OUT.exists():
        print(f"Appending to existing result file: {RESULTS_OUT.name}")
        first_write = False
    else:
        RESULTS_OUT.parent.mkdir(parents=True, exist_ok=True)
        first_write = True

    # 3. Batch submit by length
    global_batch = 0
    with open(RESULTS_OUT, "a", newline="", encoding="utf-8") as f_out:
        writer = None

        for pep_len in sorted(pep_df["peptide_len"].unique()):
            subset = pep_df[pep_df["peptide_len"] == pep_len]["peptide"]
            total_batches = math.ceil(len(subset) / BATCH_SIZE)
            print(f"\n••• Length {pep_len}: {len(subset):,} peptides → {total_batches} batches ≤ {BATCH_SIZE}")

            for i in range(total_batches):
                global_batch += 1
                batch_peps = subset.iloc[i * BATCH_SIZE:(i + 1) * BATCH_SIZE].tolist()

                # submit
                rid, _ = submit_batch(batch_peps, pep_len, global_batch, ALLELES_STR)

                # poll
                res_json = poll_result(rid)
                cols, rows = extract_peptide_table(res_json)

                # write
                if first_write:
                    writer = csv.writer(f_out)
                    writer.writerow(cols)
                    first_write = False
                if writer is None:
                    writer = csv.writer(f_out)
                writer.writerows(rows)
                f_out.flush()

                print(f"   ✅  Batch {global_batch} done – wrote {len(rows):,} rows")

    print(f"\n🎉  Done. Results → {RESULTS_OUT}")
    print(f"⏱️  Runtime: {time.time() - t0:,.1f} s")


if __name__ == "__main__":
    main()
