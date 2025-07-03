---
theme: [wide, air]
title: Influenza A (IAV) New
slug: IAVnew
toc: false
sql:
    proteins: data/IAV_all.parquet
    sequencecalc: data/IAV_sequencecalc.parquet
---

```sql
SELECT * FROM proteins ORDER BY protein LIMIT 100
```