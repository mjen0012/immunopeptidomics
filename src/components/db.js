// db.js — shared DuckDB singleton across routes
import {DuckDBClient} from "npm:@observablehq/duckdb";
import {extendDB, extended} from "./extenddb.js";

const G = globalThis;

export async function initDB(datasets, key = "default") {
  // Reuse if the same key and client exists
  const existing = G.__duckdbClient;
  if (existing && G.__duckdbKey === key && existing[extended]) {
    return existing;
  }

  // Dispose previous client if any
  if (existing) {
    try {
      if (typeof existing.close === "function") await existing.close();
      else if (typeof existing.destroy === "function") await existing.destroy();
    } catch {}
  }

  const client = extendDB(await DuckDBClient.of(datasets));
  G.__duckdbClient = client;
  G.__duckdbKey = key;
  return client;
}

export async function disposeDB() {
  const existing = G.__duckdbClient;
  if (!existing) return;
  try {
    if (typeof existing.close === "function") await existing.close();
    else if (typeof existing.destroy === "function") await existing.destroy();
  } catch {}
  delete G.__duckdbClient;
  delete G.__duckdbKey;
}

