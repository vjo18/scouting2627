"""Incremental RBFA scraping. Only raw player rows; no model calculations."""
import csv,json,os,shutil,subprocess,tempfile
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
SOURCE="https://github.com/vjo18/RBFA2627.git"
PIN="3b789ee"
COMPS=json.loads((ROOT/'config/competitions.json').read_text())
def run(args,cwd=None,env=None):
    print('RUN', ' '.join(map(str,args)),flush=True)
    subprocess.run(list(map(str,args)),cwd=cwd,env=env,check=True)
def readcsv(file):
    with file.open(encoding='utf-8-sig',newline='') as handle:return list(csv.DictReader(handle))
def validate(url):
    p=urlparse(url)
    if p.scheme!='https' or p.netloc not in ('rbfa.be','www.rbfa.be') or not p.path.startswith('/nl/competitie/') or not p.path.endswith('/kalender'):
        raise ValueError('Use a valid RBFA calendar URL: '+url)
def main():
    with tempfile.TemporaryDirectory() as folder:
        temp=Path(folder);source=temp/'source'
        run(['git','clone','--quiet',SOURCE,source])
        run(['git','checkout','--quiet',PIN],cwd=source)
        run(['npm','ci','--no-audit','--no-fund'],cwd=source)
        for comp in COMPS:
            if not comp.get('enabled',True):continue
            url=comp['calendar_url'];validate(url)
            cid=comp['id']
            if not cid or not all(c.isalnum() or c in '-_' for c in cid):raise ValueError('Invalid competition id')
            dest=ROOT/'data_raw'/cid
            stage=temp/('stage-'+cid);(stage/'data_raw').mkdir(parents=True)
            if cid=='west-vlaanderen-2627' and not (dest/'player_matchdata.csv').exists():
                dest.mkdir(parents=True,exist_ok=True)
                for fn in ('match_calendar.json','player_matchdata.csv'):
                    shutil.copy2(source/'data_raw'/fn,dest/fn)
                print('Imported initial validated season from RBFA2627')
            for fn in ('match_calendar.json','player_matchdata.csv'):
                if (dest/fn).exists():shutil.copy2(dest/fn,stage/'data_raw'/fn)
            env={**os.environ,'RBFA_CALENDAR_URL':url}
            run(['node',source/'scrapers/scrape_calendar.cjs'],cwd=stage,env=env)
            candidate=json.loads((stage/'data_raw/match_calendar.json').read_text())
            old=json.loads((dest/'match_calendar.json').read_text()) if (dest/'match_calendar.json').exists() else []
            oldurls={m['url'] for m in old};newurls={m.get('url') for m in candidate}
            if len(candidate)<8 or len(newurls)!=len(candidate) or None in newurls:raise RuntimeError(f'{cid}: incomplete/invalid calendar')
            if not oldurls.issubset(newurls):raise RuntimeError(f'{cid}: existing fixtures vanished; refusing update')
            oldplayed={m['url'] for m in old if m.get('homeScore') is not None and m.get('awayScore') is not None}
            newplayed={m['url'] for m in candidate if m.get('homeScore') is not None and m.get('awayScore') is not None}
            if not oldplayed.issubset(newplayed):raise RuntimeError(f'{cid}: played matches vanished; refusing update')
            run(['node',source/'scrapers/scrape_player_data.js'],cwd=stage,env=env)
            file=stage/'data_raw/player_matchdata.csv'
            if not file.exists():raise RuntimeError(f'{cid}: no player data')
            current=readcsv(file)
            before=readcsv(dest/'player_matchdata.csv') if (dest/'player_matchdata.csv').exists() else []
            if len(current)<15 or len(current)<len(before):raise RuntimeError(f'{cid}: player rows decreased; refusing update')
            if not {r.get('Match URL') for r in current}.issubset(newplayed):raise RuntimeError(f'{cid}: unknown player match')
            dest.mkdir(parents=True,exist_ok=True)
            for fn in ('match_calendar.json','player_matchdata.csv'):shutil.copy2(stage/'data_raw'/fn,dest/fn)
            print(f'{cid}: validated {len(newplayed)} played matches, {len(current)} player rows')
        births=source/'data_raw/player_birthyears.csv'
        if births.exists():
            (ROOT/'data_raw').mkdir(exist_ok=True)
            shutil.copy2(births,ROOT/'data_raw/birthyears.csv')
    run(['python3',ROOT/'scripts/aggregate.py'],cwd=ROOT)
if __name__=='__main__':main()
