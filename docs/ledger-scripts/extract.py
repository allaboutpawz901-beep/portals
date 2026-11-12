import re, json, pathlib
api_root = pathlib.Path.home()/"workspace/aapawz/repo/src/app/api"
files = sorted(api_root.rglob("route.ts"))
METHODS = ["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"]
IMPORT_PATTERNS = {
  "pg": r"@/lib/pg['\"]",
  "admin_api": r"@/lib/admin-api",
  "crm_enterprise": r"@/lib/crm/enterprise",
  "supabase_client": r"@supabase/|createClient|createAdminClient|getSupabase|supabaseAdmin|supabaseServer",
  "stripe": r"stripe", "twilio": r"twilio", "resend": r"resend",
  "algolia": r"algolia", "shippo": r"shippo", "mux": r"@mux|mux-node",
}
SQL_TBL = re.compile(r"\b(?:FROM|INTO|UPDATE|JOIN)\s+(?:ONLY\s+)?\"?([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\"?", re.I)
FROM_CALL = re.compile(r"\.from\(\s*['\"]([a-zA-Z_][a-zA-Z0-9_]*)['\"]")
rows = []
for f in files:
    rel = f.relative_to(api_root)
    route = "/" + "/".join(rel.parts[:-1])
    text = f.read_text(errors="replace")
    sql_text = "\n".join(l for l in text.splitlines() if not l.lstrip().startswith(("import", "//", "*")) and "require(" not in l)
    methods = sorted(set(m.group(1) for m in re.finditer(r"export\s+(?:async\s+function|const)\s+(" + "|".join(METHODS) + r")\b", text)))
    imps = {k: bool(re.search(p, text, re.I)) for k, p in IMPORT_PATTERNS.items()}
    sql_tables = set()
    for m in SQL_TBL.finditer(sql_text):
        t = m.group(1).lower()
        if t in ("select","values","dual"): continue
        sql_tables.add(t)
    from_tables = set(m.group(1).lower() for m in FROM_CALL.finditer(text))
    rows.append({
      "route": route or "/", "file": str(f.relative_to(pathlib.Path.home()/"workspace/aapawz/repo")),
      "methods": methods, "imports": imps,
      "uses_from_call": bool(from_tables), "uses_storage": ".storage." in text or "storage.from" in text,
      "uses_auth_api": bool(re.search(r"\.auth\.(admin|getUser|getSession|signIn|signUp|exchangeCode)", text)),
      "sql_tables": sorted(sql_tables), "from_tables": sorted(from_tables),
      "lines": text.count("\n") + 1,
    })
out = pathlib.Path.home()/"workspace/aapawz/ledger/routes_raw.json"
out.write_text(json.dumps(rows, indent=1))
print("routes extracted:", len(rows))
print("with sql tables:", sum(1 for r in rows if r["sql_tables"]), "| with .from tables:", sum(1 for r in rows if r["from_tables"]), "| neither:", sum(1 for r in rows if not r["sql_tables"] and not r["from_tables"]))
