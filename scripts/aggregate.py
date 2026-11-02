import csv, json, re
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[1]
COMPS=json.loads((ROOT/'config/competitions.json').read_text())
def readcsv(path,delimiter=','):
    if not path.exists():return []
    with path.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f,delimiter=delimiter))
def number(value):
    try:return float(value or 0)
    except:return 0.0
def yes(value):return str(value).strip().lower() in ('true','1','yes')
births=defaultdict(set)
for row in readcsv(ROOT/'data_raw/birthyears.csv',';'):
    name=(row.get('Naam') or '').strip().casefold()
    year=(row.get('Geboortejaar') or '').strip()
    if name and year.isdigit():births[name].add(int(year))
output=[]
for comp in COMPS:
    if not comp.get('enabled',True):continue
    base=ROOT/'data_raw'/comp['id']
    matches=json.loads((base/'match_calendar.json').read_text()) if (base/'match_calendar.json').exists() else []
    done={m['url'] for m in matches if m.get('homeScore') is not None and m.get('awayScore') is not None}
    groups={}
    for row in readcsv(base/'player_matchdata.csv'):
        if row.get('Match URL') not in done:continue
        team=row.get('Team','').strip(); name=row.get('Player Name','').strip()
        if not team or not name:continue
        key=(team,name)
        p=groups.setdefault(key,dict(competition=comp['id'],competitionName=comp['name'],team=team,name=name,number='',age=None,birthYear=None,appearances=0,starts=0,subIns=0,subOuts=0,minutes=0,goals=0,penalties=0,ownGoals=0,yellows=0,reds=0,yellowReds=0,cleanSheets=0,captain=0,goalkeeper=False,matchUrls=[]))
        p['appearances']+=1;p['matchUrls'].append(row['Match URL'])
        if row.get('Jersey Number'):p['number']=row['Jersey Number']
        for src,dst in [('Starting Player','starts'),('Substituted In','subIns'),('Substituted Out','subOuts'),('Clean Sheet','cleanSheets'),('Is Captain','captain')]:
            p[dst]+=int(yes(row.get(src)))
        p['goalkeeper']=p['goalkeeper'] or yes(row.get('Is Goalkeeper'))
        for src,dst in [('Minutes Played','minutes'),('Goals Scored','goals'),('Penalties Scored','penalties'),('Own Goals Scored','ownGoals'),('Yellow Cards','yellows'),('Red Cards','reds'),('YellowRed Cards','yellowReds')]:
            p[dst]+=number(row.get(src))
    for p in groups.values():
        years=births.get(p['name'].casefold(),set())
        if len(years)==1:
            p['birthYear']=next(iter(years))
            p['age']=datetime.now(timezone.utc).year-p['birthYear']
        p['minutes']=round(p['minutes'])
        for name in ('goals','penalties','ownGoals','yellows','reds','yellowReds'):p[name]=int(p[name])
        p['minutesPerMatch']=round(p['minutes']/p['appearances'],1) if p['appearances'] else 0
        p['goalsPer90']=round(p['goals']*90/p['minutes'],2) if p['minutes'] else 0
        p['minutesShare']=round(p['minutes']/(len(done)/16*90)*100,1) if done else 0
        output.append(p)
out=dict(players=sorted(output,key=lambda p:(-p['minutes'],p['name'])),competitions=[dict(id=c['id'],name=c['name'],played=sum(m.get('homeScore') is not None and m.get('awayScore') is not None for m in json.loads((ROOT/'data_raw'/c['id']/'match_calendar.json').read_text())) if (ROOT/'data_raw'/c['id']/'match_calendar.json').exists() else 0) for c in COMPS if c.get('enabled',True)],updatedAt=datetime.now(timezone.utc).isoformat())
dst=ROOT/'public/data/players.json';dst.parent.mkdir(parents=True,exist_ok=True);dst.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
print(f"Saved {len(output)} players to {dst}")
