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
team_births=defaultdict(set)
for row in readcsv(ROOT/'data_raw/birthyears.csv',';'):
    name=(row.get('Naam') or '').strip().casefold()
    year=(row.get('Geboortejaar') or '').strip()
    if name and year.isdigit():
        births[name].add(int(year))
        team_births[((row.get('ClubRBFA') or '').strip().casefold(),name)].add(int(year))
output=[]
for comp in COMPS:
    if not comp.get('enabled',True):continue
    base=ROOT/'data_raw'/comp['id']
    matches=json.loads((base/'match_calendar.json').read_text()) if (base/'match_calendar.json').exists() else []
    done={m['url'] for m in matches if m.get('homeScore') is not None and m.get('awayScore') is not None}
    team_record=defaultdict(lambda: {'played':0,'points':0})
    for m in matches:
        try:
            home=int(m['homeScore']); away=int(m['awayScore'])
        except (ValueError,TypeError,KeyError):
            continue
        for side,opponent,team in [(home,away,m.get('homeTeam','')),(away,home,m.get('awayTeam',''))]:
            if not team:continue
            team_record[team]['played']+=1
            team_record[team]['points']+=3 if side>opponent else (1 if side==opponent else 0)
    groups={}
    for row in readcsv(base/'player_matchdata.csv'):
        if row.get('Match URL') not in done:continue
        team=row.get('Team','').strip(); name=row.get('Player Name','').strip()
        if not team or not name:continue
        key=(team,name)
        p=groups.setdefault(key,dict(competition=comp['id'],competitionName=comp['name'],team=team,name=name,number='',age=None,birthYear=None,appearances=0,starts=0,subIns=0,subOuts=0,minutes=0,goals=0,subGoals=0,penalties=0,ownGoals=0,yellows=0,reds=0,yellowReds=0,cleanSheets=0,captain=0,goalkeeper=False,matchUrls=[]))
        p['appearances']+=1;p['matchUrls'].append(row['Match URL'])
        if row.get('Jersey Number'):p['number']=row['Jersey Number']
        for src,dst in [('Starting Player','starts'),('Substituted In','subIns'),('Substituted Out','subOuts'),('Clean Sheet','cleanSheets'),('Is Captain','captain')]:
            p[dst]+=int(yes(row.get(src)))
        p['goalkeeper']=p['goalkeeper'] or yes(row.get('Is Goalkeeper'))
        if yes(row.get('Substituted In')):
            p['subGoals']+=int(number(row.get('Goals Scored')))
        for src,dst in [('Minutes Played','minutes'),('Goals Scored','goals'),('Penalties Scored','penalties'),('Own Goals Scored','ownGoals'),('Yellow Cards','yellows'),('Red Cards','reds'),('YellowRed Cards','yellowReds')]:
            p[dst]+=number(row.get(src))
    for p in groups.values():
        years=team_births.get((p['team'].casefold(),p['name'].casefold()),set()) or births.get(p['name'].casefold(),set())
        if len(years)==1:
            p['birthYear']=next(iter(years))
            p['age']=datetime.now(timezone.utc).year-p['birthYear']
        record=team_record.get(p['team'],{})
        p['teamPPW']=round(record['points']/record['played'],2) if record.get('played') else None
        p['minutes']=round(p['minutes'])
        for name in ('goals','subGoals','penalties','ownGoals','yellows','reds','yellowReds'):p[name]=int(p[name])
        p['minutesPerMatch']=round(p['minutes']/p['appearances'],1) if p['appearances'] else 0
        p['goalsPer90']=round(p['goals']*90/p['minutes'],2) if p['minutes'] else 0
        p['minutesShare']=round(p['minutes']/(len(done)/16*90)*100,1) if done else 0
        output.append(p)
out=dict(players=sorted(output,key=lambda p:(-p['minutes'],p['name'])),competitions=[dict(id=c['id'],name=c['name'],played=sum(m.get('homeScore') is not None and m.get('awayScore') is not None for m in json.loads((ROOT/'data_raw'/c['id']/'match_calendar.json').read_text())) if (ROOT/'data_raw'/c['id']/'match_calendar.json').exists() else 0) for c in COMPS if c.get('enabled',True)],updatedAt=datetime.now(timezone.utc).isoformat())
dst=ROOT/'public/data/players.json';dst.parent.mkdir(parents=True,exist_ok=True);dst.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
print(f"Saved {len(output)} players to {dst}")
