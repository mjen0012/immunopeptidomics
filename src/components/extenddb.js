/*  extenddb.js  —  trimmed helper for array & sub-query interpolation  */
const mark      = Symbol("partial");
export const extended = Symbol("extended");

const isSubquery = d => d?.[mark];

/* — internal helpers — */
const coerce = ([strings, ...params]) => [
  Array.isArray(strings) ? strings : [`${strings ?? ""}`],
  ...params
];

function mergeQueries(test, strings, ...params) {
  const mergedStr = [];
  const mergedPar = [];

  function dig(p) {
    if (!test(p)) { mergedPar.push(p); return false; }
    const [s, ...q] = mergeQueries(test, ...p);
    mergedStr[mergedStr.length - 1] += s[0];
    mergedStr.push(...s.slice(1));
    mergedPar.push(...q);
    return true;
  }

  for (let i = 0, join; i < strings.length; i++) {
    if (join) mergedStr[mergedStr.length - 1] += strings[i];
    else mergedStr.push(strings[i]);
    join = i < params.length ? dig(params[i]) : false;
  }
  return [mergedStr, ...mergedPar];
}

function expandParams(strings, ...params) {
  const outStr = [], outPar = [];
  for (const [i, s] of strings.entries()) {
    outStr.push(s);
    if (i >= params.length) continue;
    const p = params[i];
    if (Array.isArray(p)) {
      for (let j = 1; j < p.length; ++j) outStr.push(",");
      outPar.push(...p);
    } else outPar.push(p);
  }
  return [outStr, ...outPar];
}

// Fold `${...}` that appear inside single-quoted SQL string literals into
// a single bound parameter. This enables patterns like:
//   read_parquet('https://host/${protein}.parquet')
// to work the same as:
//   const url = `https://host/${protein}.parquet`;
//   read_parquet(${url})
function foldQuotedParams(strings, ...params) {
  const s = strings.slice();
  const outStr = [];
  const outPar = [];

  for (let i = 0; i < s.length; i++) {
    const left = s[i];
    if (i < params.length) {
      const right = s[i + 1] ?? "";
      const lq = left.lastIndexOf("'");
      const rq = right.indexOf("'");
      if (lq !== -1 && rq !== -1) {
        const prefix    = left.slice(0, lq);
        const leftPart  = left.slice(lq + 1);
        const rightPart = right.slice(0, rq);
        const suffix    = right.slice(rq + 1);

        // Inline the literal inside quotes with proper escaping, and
        // merge with the following chunk so no stray '?' is introduced
        // when strings are joined by the client.
        const content = `${leftPart}${params[i]}${rightPart}`;
        const escaped = String(content).replaceAll("'", "''");
        outStr.push(prefix + "'" + escaped + "'" + suffix);
        i++; // skip the next chunk (we merged it via `suffix`)
        continue;
      }
    }
    outStr.push(left);
    if (i < params.length) outPar.push(params[i]);
  }
  return [outStr, ...outPar];
}

/* — exported API — */
export const sql = (...args) =>
  Object.defineProperty(coerce(args), mark, {value: true});

export function extendDB(client) {
  const {sql: tag, queryTag} = client;
  const process = (a) => expandParams(
    ...foldQuotedParams(...mergeQueries(isSubquery, ...a))
  );

  return new Proxy(client, {
    get(t, k) {
      if (k === "queryTag") return (...a) => queryTag.apply(client, process(a));
      if (k === "sql")      return (...a) => tag     .apply(client, process(a));
      if (k === "partial")  return sql;
      if (k === extended)   return true;
      return t[k];
    }
  });
}

/* optional helper from the notebook */
export function nonStreaming(client) {
  return new Proxy(client, {
    has  : (t, p) => p === "queryStream" ? false    : Reflect.has(t, p),
    get  : (t, p) => p === "queryStream" ? undefined : Reflect.get(t, p)
  });
}

// Singleton helper to avoid creating multiple DuckDB instances.
// Usage (in notebook):
//   const db = await getOrCreateDB(() => DuckDBClient.of())
// Optionally call `disposeDB()` to explicitly free the instance.
const DB_KEY = Symbol.for("__duckdb_singleton__");

export async function getOrCreateDB(factory) {
  const g = globalThis;
  const prev = g[DB_KEY];
  if (prev?.[extended]) {
    try { console.info('[extenddb] Reusing existing DuckDB instance'); } catch {}
    return prev;
  }
  const raw = await factory();
  const db  = extendDB(raw);
  g[DB_KEY] = db;
  try { console.info('[extenddb] Created new DuckDB instance'); } catch {}
  return db;
}

export async function disposeDB() {
  const g = globalThis;
  const prev = g[DB_KEY];
  g[DB_KEY] = undefined;
  try { await prev?.close?.(); }     catch {}
  try { await prev?.terminate?.(); } catch {}
  try { await prev?.destroy?.(); }   catch {}
}
