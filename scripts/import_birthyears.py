"""Import verified MacroDroid birthyear results without overwriting old years."""
import csv
import datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/"data_raw"
DEST=RAW/"birthyears.csv"
UPLOADS=RAW/"birthyear_uploads"

def norm(s):return " ".join((s or "").strip().casefold().split())
def read(path):
    if not path.exists():return []
    with path.open(encoding="utf-8-sig",newline="") as f:
        first=f.readline()
        f.seek(0)
        return list(csv.DictReader(f,delimiter=";" if first.count(";")>=first.count(",") else ","))
def main():
    mapping={norm(r.get("TeamRepo")):r.get("ClubRBFA","").strip() for r in read(RAW/"team_club_mapping.csv") if r.get("ClubRBFA")}
    old=read(DEST)
    known={}
    for r in old:
        club=mapping.get(norm(r.get("ClubRBFA")),r.get("ClubRBFA","").strip())
        name=r.get("Naam","").strip()
        year=r.get("Geboortejaar","").strip()
        if not (club and name and year) or norm(club) in {"royal belgian fa","rbfa","voetbal vlaanderen"}:continue
        key=(norm(club),norm(name))
        if key in known and known[key]["Geboortejaar"]!=year:
            raise RuntimeError(f"Existing birthyear conflict for {club} / {name}")
        known[key]={"ClubRBFA":club,"Naam":name,"Geboortejaar":year}
    allowed=set()
    for folder in RAW.iterdir():
        f=folder/"player_matchdata.csv"
        if f.exists():
            allowed.update((norm(mapping.get(norm(r.get("Team")),r.get("Team"))),norm(r.get("Player Name"))) for r in read(f))
    added=skipped=conflicts=0
    for file in sorted(UPLOADS.glob("*.csv")):
        for row in read(file):
            if not {"Naam","Geboortejaar"}.issubset(row):raise RuntimeError(f"{file}: missing Naam or Geboortejaar")
            if norm(row.get("Gevonden")) in {"false","onwaar","nee","no","0","niet gevonden"}:skipped+=1;continue
            club=(row.get("Ploeg") or row.get("ClubRBFA") or "").strip()
            club=mapping.get(norm(club),club)
            if norm(club) in {"royal belgian fa","rbfa","voetbal vlaanderen"}:
                skipped+=1
                continue
            name=(row.get("Naam") or "").strip()
            year=(row.get("Geboortejaar") or "").strip()
            key=(norm(club),norm(name))
            if key not in allowed or not year.isdecimal() or len(year)!=4 or not 1900<=int(year)<=datetime.date.today().year:
                skipped+=1;continue
            oldrecord=known.get(key)
            if oldrecord:
                if oldrecord["Geboortejaar"]!=year:conflicts+=1
                continue
            known[key]={"ClubRBFA":club,"Naam":name,"Geboortejaar":year}
            added+=1
    if conflicts:
        raise RuntimeError(f"{conflicts} conflicting birth years; refusing overwrite. Added items not saved.")
    DEST.parent.mkdir(exist_ok=True)
    with DEST.open("w",encoding="utf-8",newline="") as f:
        out=csv.DictWriter(f,fieldnames=["ClubRBFA","Naam","Geboortejaar"],delimiter=";",lineterminator="\n")
        out.writeheader()
        out.writerows(sorted(known.values(),key=lambda r:(norm(r["ClubRBFA"]),norm(r["Naam"]))))
    print(f"Imported {added} years, skipped {skipped}, conflicts {conflicts}; {len(known)} known")
if __name__=="__main__":main()
