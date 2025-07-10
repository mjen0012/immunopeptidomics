// Minimal Vercel Function that forwards JSON → IEDB Next-Gen pipeline
import fetch from "node-fetch";          // Already available in Vercel

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("POST only");
    return;
  }

  try {
    const r = await fetch(
      "https://api-nextgen-tools.iedb.org/api/v1/pipeline",
      {
        method:  "POST",
        headers: {"content-type": "application/json"},
        body:    JSON.stringify(req.body),
      }
    );

    // Propagate non-200s so the front-end can surface them
    if (!r.ok) {
      const text = await r.text();
      res.status(r.status).send(text);
      return;
    }

    res.setHeader("cache-control", "no-store");
    res.status(200).json(await r.json());
  } catch (err) {
    res.status(502).send(`Proxy error: ${err.message}`);
  }
}
