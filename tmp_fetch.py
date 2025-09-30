import duckdb

con = duckdb.connect()
con.execute('INSTALL httpfs;')
con.execute('LOAD httpfs;')
con.execute("CREATE OR REPLACE TABLE proteins_cache AS SELECT * FROM read_parquet('https://gbxc45oychilox63.public.blob.vercel-storage.com/IBV_M1.parquet')")
print(con.execute('SELECT COUNT(*) FROM proteins_cache').fetchone())
con.execute("CREATE OR REPLACE TABLE proteins_cache AS SELECT * FROM read_parquet('https://gbxc45oychilox63.public.blob.vercel-storage.com/IBV_M1.parquet')")
print(con.execute('SELECT COUNT(*) FROM proteins_cache').fetchone())
