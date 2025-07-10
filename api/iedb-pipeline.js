// GET /api/iedb-result?id=<UUID>
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("GET only");

  const { id } = req.query;
  if (!id) return res.status(400).send("Missing id");

  const url = `https://api-nextgen-tools.iedb.org/api/v1/results/${id}`;

  try {
    const upstream = await fetch(url);
    const raw      = await upstream.text();
    const parsed   = tryJSON(raw);

    res.setHeader("cache-control", "no-store");
    res.status(upstream.status).send(parsed ?? raw);
  } catch (err) {
    console.error("Result proxy error:", err);
    res.status(502).send(`Proxy error: ${err.message}`);
  }
}

function tryJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}
