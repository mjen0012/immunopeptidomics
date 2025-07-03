---
theme: [wide, air]
title: IAV
slug: test3-copy-2
toc: false
sql:
    proteins: data/IAV_all.parquet
    sequencecalc: data/IAV_sequencecalc.parquet
---

```sql id=fulltable display
SELECT * FROM proteins ORDER BY protein LIMIT 10
```