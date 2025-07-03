---
theme: [wide, air]
title: IAV
sql:
    proteins: data/IAV_all.parquet
    sequencecalc: data/IAV_sequencecalc.parquet
---

```sql id=fulltable display
SELECT * FROM proteins ORDER BY protein LIMIT 10
```

# Yup