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

/* — exported API — */
export const sql = (...args) =>
  Object.defineProperty(coerce(args), mark, {value: true});

export function extendDB(client) {
  const {sql: tag, queryTag} = client;
  const process = (a) => expandParams(...mergeQueries(isSubquery, ...a));

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
