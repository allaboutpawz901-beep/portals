import re, json, pathlib
home = pathlib.Path.home()
src = home/"workspace/aapawz/repo/src"
SQL_TBL = re.compile(r"\b(?:FROM|INTO|UPDATE|JOIN)\s+(?:ONLY\s+)?\"?([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\"?", re.I)
FROM_CALL = re.compile(r"\.from\(\s*['\"]([a-zA-Z_][a-zA-Z0-9_]*)['\"]")
TABLE_CONST = re.compile(r"(?:const|let|var)\s+TABLE\w*\s*=\s*['\"]([a-z_][a-z0-9_]*)['\"]", re.I)
CRUD_ARG = re.compile(r"\badmin(?:List|Create|Update|Delete|Get|Query)\(\s*['\"]([a-z_][a-z0-9_]*)['\"]")
def clean(t):
    return "\n".join(l for l in t.splitlines() if not l.lstrip().startswith(("import", "//", "*")) and "require(" not in l)
def evidence(text):
    st = clean(text)
    sql = set(m.group(1).lower() for m in SQL_TBL.finditer(st)) - {"select", "values", "dual"}
    frm = set(m.group(1).lower() for m in FROM_CALL.finditer(text))
    tc = set(m.group(1).lower() for m in TABLE_CONST.finditer(text)) | set(m.group(1).lower() for m in CRUD_ARG.finditer(text))
    return {"sql": sql, "from": frm, "const": tc,
      "pg": bool(re.search(r"@/lib/pg['\"]|pgQuery|withPg", text)),
      "sb": bool(re.search(r"@supabase/|createClient|createAdminClient|getSupabase|supabaseAdmin|supabaseServer|@/lib/repo", text)),
      "storage": ".storage." in text or "storage.from" in text,
      "authapi": bool(re.search(r"\.auth\.(admin|getUser|getSession|signIn|signUp|exchangeCode)", text))}
# evidence for every ts/tsx in src
file_ev = {}
for f in src.rglob("*.ts*"):
    if f.suffix not in (".ts", ".tsx"): continue
    try: text = f.read_text(errors="replace")
    except Exception: continue
    file_ev[str(f.relative_to(src))] = (evidence(text), text)
def resolve(imp, from_rel):
    if imp.startswith("@/"): cand = imp[2:]
    elif imp.startswith("."):
        cand = str((pathlib.Path(from_rel).parent/imp).as_posix())
        parts = []
        for p in cand.split("/"):
            if p == "..":
                if parts: parts.pop()
            elif p != ".": parts.append(p)
        cand = "/".join(parts)
    else: return None
    for suf in (".ts", ".tsx", "/index.ts", "/index.tsx", ""):
        if cand + suf in file_ev: return cand + suf
    return None
IMPORT_RE = re.compile(r"(?:from\s+|import\s*\(|export\s+[^'\"]*from\s+)['\"]([^'\"]+)['\"]")
routes = []
api = src/"app/api"
for f in sorted(api.rglob("route.ts")):
    rel = str(f.relative_to(src)); text = f.read_text(errors="replace")
    ev, _ = file_ev[rel]
    uni = {"sql": set(ev["sql"]), "from": set(ev["from"]), "const": set(ev["const"]),
           "pg": ev["pg"], "sb": ev["sb"], "storage": ev["storage"], "authapi": ev["authapi"], "via": 0}
    for m in IMPORT_RE.finditer(text):
        tgt = resolve(m.group(1), rel)
        if tgt and tgt != rel:
            lev = file_ev[tgt][0]
            before = len(uni["sql"] | uni["from"] | uni["const"])
            uni["sql"] |= lev["sql"]; uni["from"] |= lev["from"]; uni["const"] |= lev["const"]
            uni["pg"] |= lev["pg"]; uni["sb"] |= lev["sb"]; uni["storage"] |= lev["storage"]; uni["authapi"] |= lev["authapi"]
            if len(uni["sql"] | uni["from"] | uni["const"]) > before: uni["via"] += 1
    methods = sorted(set(m.group(1) for m in re.finditer(r"export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b", text)))
    routes.append({"route": "/" + "/".join(f.relative_to(api).parts[:-1]), "file": str(f.relative_to(home/"workspace/aapawz/repo")),
      "methods": methods, "lines": text.count("\n") + 1,
      "imports_ext": {k: bool(re.search(p, text, re.I)) for k, p in {"stripe": r"stripe", "twilio": r"twilio", "resend": r"resend", "algolia": r"algolia", "shippo": r"shippo", "mux": r"@mux|mux-node"}.items()},
      "sql_tables": sorted(uni["sql"]), "from_tables": sorted(uni["from"]), "const_tables": sorted(uni["const"]),
      "pg": uni["pg"], "sb": uni["sb"], "storage": uni["storage"], "authapi": uni["authapi"], "libs_with_evidence": uni["via"]})
(home/"workspace/aapawz/ledger/routes_raw2.json").write_text(json.dumps(routes, indent=1))
universe = set()
for ev, _ in file_ev.values(): universe |= {t.split(".")[-1] for t in ev["sql"]} | ev["from"] | ev["const"]
(home/"workspace/aapawz/ledger/table_universe_src.json").write_text(json.dumps(sorted(universe), indent=1))
print("routes:", len(routes), "| src table universe:", len(universe))
print("routes with any table evidence:", sum(1 for r in routes if r["sql_tables"] or r["from_tables"] or r["const_tables"]))
