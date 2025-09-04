// Tiny DuckDB-WASM client for HTTPFS single-file reads.
// Usage example:
//   import { getConnection, proteinUrl, fetchProteinIndex } from './duckdbClient.js';
//   const conn = await getConnection();
//   const url = proteinUrl('NP');
//   const res = await conn.query(`SELECT COUNT(*) FROM read_parquet('${url}')`);

import * as duckdb from '@duckdb/duckdb-wasm';

// Prefer CDN-hosted worker/module assets to avoid bundler configuration.
// If you want to self-host, switch to duckdb.getBundledBundles().
const DUCKDB_BUNDLES = duckdb.getJsDelivrBundles();

let _connPromise = null;

export async function getConnection() {
  if (_connPromise) return _connPromise;
  _connPromise = (async () => {
    const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
    const worker = new Worker(bundle.mainWorker);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const conn = await db.connect();
    // Enable HTTPFS so read_parquet can fetch over HTTP(S)
    await conn.query("INSTALL httpfs; LOAD httpfs;");
    return conn;
  })();
  return _connPromise;
}

// Base path for the per-protein Parquet files.
export const DEFAULT_PROTEIN_BASE = '/data/iav6/protein';

export function proteinUrl(protein, base = DEFAULT_PROTEIN_BASE) {
  // Keep URL simple; server provides caching and range requests.
  return `${base}/${encodeURIComponent(protein)}.parquet`;
}

export async function fetchProteinIndex(base = DEFAULT_PROTEIN_BASE) {
  const resp = await fetch(`${base}/index.json`, { cache: 'force-cache' });
  if (!resp.ok) throw new Error(`Failed to fetch index.json: ${resp.status}`);
  return await resp.json();
}

export async function queryProtein(protein, sql = null, base = DEFAULT_PROTEIN_BASE) {
  const conn = await getConnection();
  const url = proteinUrl(protein, base);
  // If sql is provided, it should reference {url} where the parquet URL goes.
  if (sql) {
    const resolved = sql.replaceAll('{url}', url);
    return await conn.query(resolved);
  }
  // Default: simple passthrough read (caller can add WHERE/LIMIT client-side)
  return await conn.query(`SELECT * FROM read_parquet('${url}')`);
}

