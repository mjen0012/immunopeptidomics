// api/iedb-pipeline.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("POST only");

  try {
    const upstream = await fetch(
      "https://api-nextgen-tools.iedb.org/api/v1/pipeline",
      {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(req.body)
      }
    );

    const text   = await upstream.text();         // raw string
    const parsed = safeJSON(text);                // try to parse once
    console.log("IEDB responded:", upstream.status, parsed ?? text);

    res.setHeader("cache-control", "no-store");
    res.status(upstream.status).send(parsed ?? text);  // one send only
  } catch (err) {
    res.status(502).send(`Proxy error: ${err.message}`);
  }
}

function safeJSON(str) {
  try { return JSON.parse(str); } catch { return null; }
}
