"""Merge discovered RBFA club names with the latest persisted team mapping."""
import csv
import pathlib
import sys

root=pathlib.Path(__file__).resolve().parents[1]
target=root/"data_raw/team_club_mapping.csv"
source=pathlib.Path(sys.argv[1])
fields=["TeamRepo","ClubRBFA","ClubID","Stamnummer"]

def load(file):
    if not file.exists():return {}
    with file.open(encoding="utf-8-sig",newline="") as handle:
        return {r["TeamRepo"]:r for r in csv.DictReader(handle,delimiter=";") if r.get("TeamRepo")}

def valid_name(value):
    return bool(value and value.strip().casefold() not in {"royal belgian fa","rbfa","voetbal vlaanderen","club","info","welkom"})

current=load(target)
discovered=load(source)
for name,row in discovered.items():
    old=current.get(name,{field:"" for field in fields})
    # Never replace a confirmed value by an empty field from a failed lookup.
    current[name]={field:(row.get(field) or old.get(field) or "") for field in fields}
    if not valid_name(current[name]["ClubRBFA"]):current[name]["ClubRBFA"]=""
target.parent.mkdir(parents=True,exist_ok=True)
with target.open("w",encoding="utf-8",newline="") as handle:
    writer=csv.DictWriter(handle,fieldnames=fields,delimiter=";",lineterminator="\n")
    writer.writeheader()
    writer.writerows(current[k] for k in sorted(current))
print(f"Club mapping: {len(current)} teams, {sum(valid_name(r["ClubRBFA"]) for r in current.values())} official names")
