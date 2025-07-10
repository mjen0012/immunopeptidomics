// Serverless proxy: forwards JSON payloads to IEDB Next-Gen pipeline
import fetch from "node-fetch";             // available in Vercel runtime

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("POST only");
    return;
  }

  try {
    /* forward request to IEDB */
    const upstream = await fetch(
      "https://api-nextgen-tools.iedb.org/api/v1/pipeline",
      {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(req.body)
      }
    );

    /* read once, then log and relay */
    const raw = await upstream.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }

    console.log("IEDB responded:", upstream.status, parsed ?? raw);

    res.setHeader("cache-control", "no-store");
    res.status(upstream.status).send(parsed ?? raw);   // single send
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(502).send(`Proxy error: ${err.message}`);
  }
}
