---
theme: [wide, air, alt]
title: Influenza A (IAV) V2
slug: IAV2
toc: false
---


```js
// Minimal: switch the "proteins" table by mapping it to a Blob URL with ${protein}
const PROTEINS = ["HA","M1","M2","NA","NP","NS1","NS2","PA","PAX","PB1","PB1F2","PB2"];
const protein  = view(Inputs.select(PROTEINS, { label: "Protein", value: "M2" }));
```



```js
import {extendDB, sql, extended, getOrCreateDB} from "./components/extenddb.js"
```

```js

/* Wrap Database – reuse a single instance */
const db = await getOrCreateDB(() => DuckDBClient.of());

// Build the parquet URL in JS and pass it as a bound parameter
const url = `https://gbxc45oychilox63.public.blob.vercel-storage.com/${encodeURIComponent(protein)}.parquet`;

await db.sql`CREATE OR REPLACE VIEW addresses AS
  SELECT * FROM read_parquet('${url}')`;
```



```js
const allGenotypes = (await db.sql`
  SELECT *
  FROM addresses
`)
```

```js
Inputs.table(allGenotypes)
```
