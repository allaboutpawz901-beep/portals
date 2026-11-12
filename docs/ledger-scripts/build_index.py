import re, json, pathlib, collections
schema_root = pathlib.Path.home()/"workspace/aapawz/platform/schema"
table2domain = {}
collisions = collections.defaultdict(set)
for f in sorted(schema_root.glob("*/10_tables.sql")):
    domain = f.parent.name
    text = f.read_text(errors="replace")
    for m in re.finditer(r"CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?\"?([a-zA-Z_][a-zA-Z0-9_]*)\"?", text):
        t = m.group(1).lower()
        if t in table2domain and table2domain[t] != domain:
            collisions[t].add(table2domain[t]); collisions[t].add(domain)
        table2domain.setdefault(t, domain)
out = pathlib.Path.home()/"workspace/aapawz/ledger/table_index.json"
out.write_text(json.dumps({"table2domain": table2domain, "collisions": {k: sorted(v) for k, v in collisions.items()}}, indent=1))
print(f"tables indexed: {len(table2domain)}  collisions: {len(collisions)}")
print("domains covered:", len(set(table2domain.values())))
