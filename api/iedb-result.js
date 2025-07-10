import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).send("GET only");
    return;
  }
  const { id } = req.query;
  if (!id) return res.status(400).send("Missing id");

  try {
    const upstream = await fetch(
      `https://api-nextgen-tools.iedb.org/api/v1/results/${id}`
    );
    const raw    = await upstream.text();
    const parsed = tryJSON(raw);

    console.log("Result →", upstream.status, parsed ?? raw);

    res.setHeader("cache-control", "no-store");
    res.status(upstream.status).send(parsed ?? raw);
  } catch (err) {
    res.status(502).send(`Proxy error: ${err.message}`);
  }
}

function tryJSON(s) { try { return JSON.parse(s); } catch { return null; } }
