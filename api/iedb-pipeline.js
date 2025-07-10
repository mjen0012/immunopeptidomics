// Proxy Vercel function → IEDB Next-Gen pipeline
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("POST only");      // early exit
    return;
  }

  try {
    /* Forward ------------------------------------------------------- */
    const upstream = await fetch(
      "https://api-nextgen-tools.iedb.org/api/v1/pipeline",
      {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(req.body)
      }
    );

    /* Read once, parse once ---------------------------------------- */
    const raw    = await upstream.text();          // plain string
    const parsed = tryJSON(raw);                   // object | null

    console.log("IEDB responded:", upstream.status, parsed ?? raw);

    /* Return exactly one response ---------------------------------- */
    res.setHeader("cache-control", "no-store");
    res.status(upstream.status).send(parsed ?? raw);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(502).send(`Proxy error: ${err.message}`);
  }
}

function tryJSON(str) {
  try { return JSON.parse(str); }
  catch { return null; }
}
