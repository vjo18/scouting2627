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
            # RBFA calendar tabs sometimes repeat the same fixture in multiple views.
            # Consolidate duplicate URLs *before* validation, preserving final scores.
            def played(match):
                return match.get('homeScore') is not None and match.get('awayScore') is not None
            unique={}
            for match in candidate:
                matchurl=match.get('url')
                if not matchurl:raise RuntimeError(f'{cid}: fixture without URL')
                prior=unique.get(matchurl)
                if prior is None or (played(match) and not played(prior)):
                    unique[matchurl]=match
                elif prior is not None and played(match) and played(prior):
                    if (str(prior['homeScore']),str(prior['awayScore'])) != (str(match['homeScore']),str(match['awayScore'])):
                        raise RuntimeError(f'{cid}: conflicting final scores for {matchurl}')
            duplicate_count=len(candidate)-len(unique)
            candidate=list(unique.values())
            print(f'{cid}: calendar has {len(candidate)} unique fixtures ({duplicate_count} duplicate rows removed)',flush=True)
            oldurls={m['url'] for m in old};newurls=set(unique)
            if len(candidate)<8:raise RuntimeError(f'{cid}: incomplete calendar')
            # RBFA can omit earlier rounds. Keep existing fixtures instead of deleting them.
            # The new scrape must still cover most existing fixtures to avoid accepting
            # a severely incomplete response as an update.
            if oldurls and len(newurls & oldurls)<max(8,int(len(oldurls)*0.85)):
                print(f'WARNING {cid}: only {len(newurls & oldurls)}/{len(oldurls)} previous fixtures returned; preserving existing competition data and continuing',flush=True)
                continue
            missing=oldurls-newurls
            if missing:print(f'{cid}: RBFA omitted {len(missing)} old fixtures; preserving them',flush=True)
            # Preserve verified historical scores, but accept new results for unplayed games.
            for match in old:
                existing=unique.get(match['url'])
                if existing is None:
                    unique[match['url']]=match
                elif played(match):
                    if played(existing) and (str(match['homeScore']),str(match['awayScore'])) != (str(existing['homeScore']),str(existing['awayScore'])):
                        raise RuntimeError(f"{cid}: score changed for {match['url']}; manual review required")
                    unique[match['url']]=match
            candidate=list(unique.values())
            newplayed={m['url'] for m in candidate if played(m)}
            (stage/'data_raw/match_calendar.json').write_text(json.dumps(candidate,ensure_ascii=False,indent=2),encoding='utf-8')
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
        destination=ROOT/'data_raw/birthyears.csv'
        # Keep user-maintained birth years across refreshes; seed only once.
        if births.exists() and not destination.exists():
            destination.parent.mkdir(exist_ok=True)
            shutil.copy2(births,destination)
    run(['python3',ROOT/'scripts/aggregate.py'],cwd=ROOT)
if __name__=='__main__':main()
