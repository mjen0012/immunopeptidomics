import fetch from "node-fetch";

// Simple proxy to expose Range-friendly headers for parquet files.
// Usage: /api/parquet-proxy?protein=HA  or  /api/parquet-proxy?url=https://host/file.parquet
export default async function handler(req, res) {
  const { method } = req;

  // CORS preflight
  if (method === "OPTIONS") {
    setCors(res);
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
    res.status(204).end();
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    res.status(405).send("GET/HEAD/OPTIONS only");
    return;
  }

  try {
    const upstreamUrl = buildUpstreamUrl(req);
    if (!upstreamUrl) return res.status(400).send("Missing protein or url");

    // Forward only safe headers (not all request headers)
    const baseHeaders = {};
    const ifNoneMatch = req.headers["if-none-match"]; if (ifNoneMatch) baseHeaders["if-none-match"] = ifNoneMatch;
    const ifModified = req.headers["if-modified-since"]; if (ifModified) baseHeaders["if-modified-since"] = ifModified;

    setCors(res);
    setExpose(res);
    // Reasonable caching for static parquet
    res.setHeader("cache-control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=3600");

    if (method === "HEAD") {
      // Robust HEAD handling: probe with range GET to discover size
      let probe;
      try {
        probe = await fetch(upstreamUrl, { method: "GET", headers: { ...baseHeaders, range: "bytes=0-0" } });
      } catch (e) {
        // fallback to naive GET
        probe = await fetch(upstreamUrl, { method: "GET", headers: baseHeaders });
      }

      const contentType = probe.headers.get("content-type") || "application/octet-stream";
      const contentRange = probe.headers.get("content-range");
      const acceptRanges = probe.headers.get("accept-ranges") || "bytes";
      const lengthHdr = probe.headers.get("content-length");
      const total = parseTotalFromContentRange(contentRange) || (lengthHdr ? parseInt(lengthHdr, 10) : undefined);

      res.setHeader("content-type", contentType);
      res.setHeader("accept-ranges", acceptRanges || "bytes");
      if (contentRange) res.setHeader("content-range", contentRange);
      if (probe.headers.get("etag")) res.setHeader("etag", probe.headers.get("etag"));
      if (probe.headers.get("last-modified")) res.setHeader("last-modified", probe.headers.get("last-modified"));
      if (Number.isFinite(total)) res.setHeader("content-length", String(total));

      // Return 200 OK for HEAD with headers only
      res.status(200).end();
      return;
    }

    // GET path (pass-through, preserve Range if any)
    const range = req.headers["range"]; // may be undefined
    const headers = range ? { ...baseHeaders, range } : baseHeaders;
    const upstream = await fetch(upstreamUrl, { method: "GET", headers });

    // Pass through selected headers.
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.setHeader("content-type", contentType);
    const cLen = upstream.headers.get("content-length"); if (cLen) res.setHeader("content-length", cLen);
    const cRange = upstream.headers.get("content-range"); if (cRange) res.setHeader("content-range", cRange);
    const aRanges = upstream.headers.get("accept-ranges") || "bytes"; res.setHeader("accept-ranges", aRanges);
    const etag = upstream.headers.get("etag"); if (etag) res.setHeader("etag", etag);
    const lm = upstream.headers.get("last-modified"); if (lm) res.setHeader("last-modified", lm);

    res.status(upstream.status);
    if (upstream.body) {
      upstream.body.pipe(res);
    } else {
      const buf = await upstream.arrayBuffer();
      res.end(Buffer.from(buf));
    }
  } catch (err) {
    res.status(502).send(`Proxy error: ${err.message}`);
  }
}

function buildUpstreamUrl(req) {
  const { protein, url } = req.query || {};
  if (typeof url === "string" && url.startsWith("https://")) return url;
  if (typeof protein === "string" && protein) {
    const base = "https://gbxc45oychilox63.public.blob.vercel-storage.com/";
    // very small safety: restrict protein allowed characters
    const safe = protein.replace(/[^A-Za-z0-9_-]/g, "");
    return `${base}${encodeURIComponent(safe)}.parquet`;
  }
  return null;
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
}
function setExpose(res) {
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Range, Accept-Ranges, Content-Length, ETag, Last-Modified"
  );
}
function passthroughHeader(upstream, res, name) {
  const v = upstream.headers.get(name);
  if (v != null) res.setHeader(name, v);
}

function parseTotalFromContentRange(h) {
  if (!h) return undefined;
  // e.g. "bytes 0-0/12345"
  const m = /\/(\d+)$/.exec(h);
  return m ? parseInt(m[1], 10) : undefined;
}
