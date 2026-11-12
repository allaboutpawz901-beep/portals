import re, json, pathlib, collections, csv
home = pathlib.Path.home()
v1 = {r["route"]: r for r in json.loads((home/"workspace/aapawz/ledger/routes_raw.json").read_text())}
rows = json.loads((home/"workspace/aapawz/ledger/routes_raw2.json").read_text())
idx = json.loads((home/"workspace/aapawz/ledger/table_index.json").read_text())["table2domain"]
STOP = {"a","the","their","set","columns","website","lms","next","this","all","values","select","dual","status","state"}
TABLE_CONST = re.compile(r"(?:const|let|var)\s+TABLE\w*\s*=\s*['\"]([a-z_][a-z0-9_]*)['\"]", re.I)
CRUD_ARG = re.compile(r"\badmin(?:List|Create|Update|Delete|Get|Query)\(\s*['\"]([a-z_][a-z0-9_]*)['\"]")
repo = home/"workspace/aapawz/repo"
for r in rows:
    text = (repo/r["file"]).read_text(errors="replace")
    own = set(t.split(".")[-1] for t in v1[r["route"]]["sql_tables"]) | set(v1[r["route"]]["from_tables"]) \
        | {m.group(1).lower() for m in TABLE_CONST.finditer(text)} | {m.group(1).lower() for m in CRUD_ARG.finditer(text)}
    own -= STOP
    uni = (set(t.split(".")[-1] for t in r["sql_tables"]) | set(r["from_tables"]) | set(r["const_tables"])) - STOP
    eff = own if own else uni
    r["own_tables"] = sorted(own); r["tables_all"] = sorted(eff); r["evidence"] = "own file" if own else ("imported lib" if uni else "none")
    core = {t: idx[t] for t in eff if t in idx}
    r["core_tables"] = core; r["noncore_tables"] = sorted(t for t in eff if t not in idx)
    domains = collections.Counter(core.values())
    ext = any(r["imports_ext"].values())
    sb_data = r["sb"] and (bool(r["from_tables"]) or r["storage"] or r["authapi"])
    if sb_data and not r["pg"] and r["from_tables"] and core:
        v, dom, why = "PRESERVABLE", domains.most_common(1)[0][0], "core tables behind supabase-js; re-point data layer"
    elif sb_data and not r["pg"] and r["from_tables"]:
        v, dom, why = "NOT PRESERVABLE", "", "data behind supabase-js .from() only, no pg path, tables not in core"
    elif sb_data and not r["pg"]:
        v, dom, why = "PRESERVABLE", "", "auth/session/storage plumbing only - re-homes, contract survives"
    elif core and not r["noncore_tables"]:
        v, dom, why = "MAPS", domains.most_common(1)[0][0], "all tables resolve to core"
    elif core and r["pg"]:
        v, dom, why = "MAPS", domains.most_common(1)[0][0], "core tables via pg; extra tenant tables listed"
    elif r["pg"]:
        v, dom, why = "PRESERVABLE", "", "pg path; tables not in core index by name"
    elif ext and not eff:
        v, dom, why = "PRESERVABLE", "", "external-service contract, no tables"
    elif not eff:
        v, dom, why = "NEEDS REVIEW", "", "no data evidence in file or its imports"
    else:
        v, dom, why = "PRESERVABLE", "", "tables present, no pg path detected"
    r["verdict"], r["domain"], r["why"] = v, dom, why
    if len(domains) > 1: r["multi_domain"] = dict(domains)
OVERRIDES = {
 "/": ("NOT PRESERVABLE", "", "hello-world stub; no contract exists"),
 "/auth/admin/session": ("PRESERVABLE", "", "custom auth flow session plumbing; no data contract"),
 "/auth/customer/session": ("PRESERVABLE", "", "custom auth flow session plumbing; no data contract"),
 "/auth/employee/session": ("PRESERVABLE", "", "custom auth flow session plumbing; no data contract"),
 "/auth/groomer/session": ("PRESERVABLE", "", "custom auth flow session plumbing; no data contract"),
 "/auth/lms/session": ("PRESERVABLE", "", "custom auth flow session plumbing; no data contract"),
 "/auth/seller/session": ("PRESERVABLE", "", "custom auth flow session plumbing; no data contract"),
 "/auth/google/start": ("PRESERVABLE", "", "custom Google flow start; no data contract"),
 "/atlas": ("PRESERVABLE", "", "static reference data (US states); no database"),
 "/customers/lookup": ("PRESERVABLE", "03_contacts_parties_crm", "customers via @/lib/repo supabase CRUD; re-point to core"),
 "/wizard/data": ("PRESERVABLE", "", "booking wizard payload via wizard-data lib (two-hop delegation)"),
 "/revalidate": ("PRESERVABLE", "", "ISR revalidation plumbing"),
 "/cron/tenant-backups": ("PRESERVABLE", "", "scheduled job endpoint; storage/db via libs"),
 "/geocode/ip": ("PRESERVABLE", "", "external geocoding proxy contract"),
 "/dogs": ("PRESERVABLE", "", "pet photo serving (appointments vertical storage)"),
 "/dogs/[id]/photo": ("PRESERVABLE", "", "pet photo serving (appointments vertical storage)"),
}
for r in rows:
    if r["route"] in OVERRIDES:
        v, d, w = OVERRIDES[r["route"]]
        r["verdict"], r["domain"], r["why"] = v, d, ("HAND-SET: " + w)
counts = collections.Counter(r["verdict"] for r in rows)
print("verdicts:", dict(counts))
print("evidence tiers:", dict(collections.Counter(r["evidence"] for r in rows)))
freq = collections.Counter()
for r in rows:
    for t in r["noncore_tables"]: freq[t] += 1
print("top noncore:", freq.most_common(12))
(home/"workspace/aapawz/ledger/routes_classified3.json").write_text(json.dumps(rows, indent=1))
with open(home/"workspace/aapawz/platform/docs/api-route-ledger.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["route","methods","verdict","domain","evidence","tables_core","tables_noncore","why"])
    for r in rows:
        w.writerow([r["route"], " ".join(r["methods"]), r["verdict"], r["domain"], r["evidence"], ";".join(sorted(r["core_tables"])), ";".join(r["noncore_tables"]), r["why"]])
print("final ledger csv written")
