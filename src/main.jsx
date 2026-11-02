import React,{useEffect,useMemo,useState} from "react";
import{createRoot}from"react-dom/client";
import "./style.css";

const norm=v=>String(v??"").trim().toLocaleLowerCase("nl").replace(/\s+/g," ");
const birthKey=(team,name)=>norm(team)+"\u0001"+norm(name);
function parseDelimited(text){
 const first=(text.replace(/^\uFEFF/,"").split(/\r?\n/,1)[0]||"");
 const sep=first.includes(";")?";":",";
 const rows=[],row=[];let cell="",quoted=false;
 text=text.replace(/^\uFEFF/,"");
 for(let i=0;i<text.length;i++){const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
  else if(c===sep&&!quoted){row.push(cell);cell=""}
  else if((c==="\r"||c==="\n")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell);if(row.some(v=>v.trim()))rows.push([...row]);row.length=0;cell=""}
  else cell+=c
 }
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 const header=(rows.shift()||[]).map(v=>v.trim().replace(/^\uFEFF/,""));
 return rows.map(row=>Object.fromEntries(header.map((h,i)=>[h,(row[i]||"").trim()])));
}
function downloadCsv(filename,columns,rows){
 const quote=value=>'"'+String(value??"").replaceAll('"','""')+'"';
 const content="\uFEFF"+[columns,...rows].map(row=>row.map(quote).join(";")).join("\r\n");
 const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
 const link=document.createElement("a");link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

const fields=[["appearances","Wedstrijden"],["starts","Basis"],["subIns","Ingevallen"],["subOuts","Vervangen"],["minutes","Minuten"],["goals","Goals"],["subGoals","Goals als invaller"],["penalties","Penalties"],["ownGoals","Eigen goals"],["yellows","Geel"],["reds","Rood"],["yellowReds","2× geel"],["cleanSheets","Clean sheets (doelmannen)"],["captain","Kapitein"],["goalsPer90","Goals/90"],["teamPPW","Ploegpunten/wedstrijd"]];
const columns=[["name","Speler"],["team","Ploeg"],["number","Rugnummer"],["age","Leeftijd"],["appearances","Matchen"],["starts","Basis"],["subIns","Ingevallen"],["subOuts","Vervangen"],["minutes","Minuten"],["goals","Goals"],["subGoals","Goals als invaller"],["penalties","Penalties"],["ownGoals","Eigen goals"],["yellows","Geel"],["reds","Rood"],["yellowReds","2× geel"],["cleanSheets","Clean sheets (doelmannen)"],["captain","Kapitein"],["goalsPer90","Goals/90"],["minutesPerMatch","Minuten/match"],["teamPPW","Ploeg PPW"],["goalkeeper","Doelman"]];
const defaultColumns=["name","team","teamPPW","number","age","appearances","starts","subIns","subOuts","minutes","goals","subGoals","yellows","reds"];
const goalkeeperColumns=["name","team","teamPPW","number","age","appearances","starts","minutes","cleanSheets","minutesPerMatch","yellows","reds"];
const defaultForPosition=position=>position==="goalkeeper"?goalkeeperColumns:defaultColumns;
const storedColumns=position=>{try{const saved=JSON.parse(localStorage.getItem("scouting-columns-by-position")||"{}");const value=saved[position];return Array.isArray(value)&&value.length?value.filter(k=>columns.some(([id])=>id===k)):defaultForPosition(position)}catch{return defaultForPosition(position)}};

const presets=[
{id:"all",label:"Alle spelers",description:"Geen vast scoutingprofiel. Je ziet alle spelers die aan je eigen filters voldoen.",criteria:"Geen extra criteria."},
{id:"young",label:"Jong & veel minuten",description:"Jonge spelers die al regelmatig het vertrouwen krijgen om veel te spelen.",criteria:"Maximaal 21 jaar én minstens 60% van de mogelijke speelminuten."},
{id:"veteran",label:"30+ & weinig minuten",description:"Ervaren spelers met relatief weinig speeltijd, mogelijke kandidaten voor een nieuwe uitdaging.",criteria:"Minstens 30 jaar én maximaal 35% van de mogelijke speelminuten."},
{id:"starter",label:"Vaste basisspelers",description:"Spelers die structureel aan wedstrijden beginnen.",criteria:"Minstens 70% van de gespeelde ploegwedstrijden in de basis én minstens 3 basisplaatsen."},
{id:"regularsub",label:"Vaste invallers",description:"Spelers die vaak vanaf de bank in het veld komen en zelden starten.",criteria:"Minstens 3 invalbeurten, in minstens 50% van de gespeelde ploegwedstrijden ingevallen en niet vaker gestart dan ingevallen."},
{id:"supersub",label:"Scorende invallers",description:"Invallers die als invaller ook minstens één doelpunt maakten.",criteria:"Minstens 3 invalbeurten en minstens 1 goal als invaller."},
{id:"scorer",label:"Efficiënte doelpuntenmakers",description:"Spelers met een relatief hoge doelpuntenproductie, bij voldoende speelminuten.",criteria:"Minstens 450 minuten en minstens 0,5 goals per 90 minuten."}
];
function App(){
const[theme,setTheme]=useState(()=>{try{return localStorage.getItem("scouting-theme")||"dark"}catch{return "dark"}}),[data,setData]=useState({players:[],competitions:[]}),[birthOverrides,setBirthOverrides]=useState(()=>{try{return JSON.parse(localStorage.getItem("scouting-birthyears")||"{}")}catch{return {}}}),[birthNotice,setBirthNotice]=useState(""),[loading,setLoading]=useState(true),[query,setQuery]=useState(""),[competition,setCompetition]=useState(""),[team,setTeam]=useState(""),[ageMin,setAgeMin]=useState(""),[ageMax,setAgeMax]=useState(""),[minutesMin,setMinutesMin]=useState(""),[minutesMax,setMinutesMax]=useState(""),[position,setPosition]=useState("all"),[metric,setMetric]=useState(""),[metricMin,setMetricMin]=useState(""),[metricMax,setMetricMax]=useState(""),[preset,setPreset]=useState("all"),[sort,setSort]=useState("minutes"),[desc,setDesc]=useState(true),[selected,setSelected]=useState(null),[visibleColumns,setVisibleColumns]=useState(()=>storedColumns("all")),[columnPicker,setColumnPicker]=useState(false);
useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem("scouting-columns-by-position")||"{}");saved[position]=visibleColumns;localStorage.setItem("scouting-columns-by-position",JSON.stringify(saved))}catch{}},[visibleColumns,position]);
function changePosition(next){setPosition(next);setVisibleColumns(storedColumns(next));setSort("minutes");setDesc(true)}

useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem("scouting-theme",theme)},[theme]);
useEffect(()=>{fetch(import.meta.env.BASE_URL+"data/players.json").then(x=>{if(!x.ok)throw Error("Geen data");return x.json()}).then(setData).catch(console.error).finally(()=>setLoading(false))},[]);
const players=useMemo(()=>(data.players||[]).map(p=>{const year=birthOverrides[birthKey(p.team,p.name)];return year?{...p,birthYear:year,age:new Date().getFullYear()-year}:p}),[data.players,birthOverrides]);
useEffect(()=>{try{localStorage.setItem("scouting-birthyears",JSON.stringify(birthOverrides))}catch{}},[birthOverrides]);
async function uploadBirthyears(event){
 const file=event.target.files?.[0];if(!file)return;
 try{
  const rows=parseDelimited(await file.text());
  if(!rows.length)throw Error("Geen rijen gevonden.");
  const required=["Naam","Geboortejaar"];if(!required.every(k=>k in rows[0])||(!("Ploeg" in rows[0])&&!('ClubRBFA' in rows[0])))throw Error("Verwacht Ploeg;Naam;Geboortejaar;Gevonden of ClubRBFA;Naam;Geboortejaar.");
  const valid=new Map(players.map(p=>[birthKey(p.team,p.name),p]));
  const updates={};let added=0,skipped=0,conflicts=0;const yearNow=new Date().getFullYear();
  for(const row of rows){
   if(["false","nee","no","0","niet gevonden"].includes(norm(row.Gevonden))){skipped++;continue}
   const team=row.Ploeg||row.ClubRBFA||"",name=row.Naam||"",key=birthKey(team,name);
   const year=Number(row.Geboortejaar);
   if(!valid.has(key)||!/^(19|20)\d{2}$/.test(row.Geboortejaar||"")||year>yearNow||year<1900){skipped++;continue}
   const existing=valid.get(key).birthYear||birthOverrides[key]||updates[key];
   if(existing&&Number(existing)!==year){conflicts++;continue}
   if(!existing){updates[key]=year;added++}
  }
  if(added)setBirthOverrides(before=>({...before,...updates}));
  setBirthNotice("Import: "+added+" geboortejaren toegevoegd, "+skipped+" overgeslagen, "+conflicts+" conflicten. "+(conflicts?"Bestaande geboortejaren werden niet overschreven. ":"")+"Sla de master-CSV op GitHub op voor blijvende synchronisatie.");
 }catch(e){setBirthNotice("CSV niet verwerkt: "+e.message)}
 event.target.value="";
}
function exportBirthyearDatabase(){
 const map=new Map();
 for(const p of players)if(p.birthYear){const key=birthKey(p.team,p.name);map.set(key,[p.team,p.name,p.birthYear])}
 downloadCsv("scouting_geboortejaren_master.csv",["ClubRBFA","Naam","Geboortejaar"],[...map.values()].sort((a,b)=>a[0].localeCompare(b[0],"nl")||a[1].localeCompare(b[1],"nl")));
}
function exportMacroMissing(){
 const map=new Map();
 for(const p of players)if(!p.birthYear)map.set(birthKey(p.team,p.name),[p.team,p.name]);
 downloadCsv("macrodroid_missing_birthyears.csv",["Ploeg","Naam"],[...map.values()].sort((a,b)=>a[0].localeCompare(b[0],"nl")||a[1].localeCompare(b[1],"nl")));
}

const teams=useMemo(()=>[...new Set(players.filter(x=>!competition||x.competition===competition).map(x=>x.team))].sort(),[players,competition]);
const matchesByCompetition=useMemo(()=>Object.fromEntries((data.competitions||[]).map(c=>[c.id,Number(c.played||0)])),[data.competitions]);
const activePreset=presets.find(p=>p.id===preset)||presets[0];
const filtered=useMemo(()=>players.filter(p=>{
const teamMatches=matchesByCompetition[p.competition]?matchesByCompetition[p.competition]*2/16:0;
const possibleMinutes=teamMatches*90;
const text=(p.name+" "+p.team+" "+(p.number||"")).toLocaleLowerCase();
if(query&&!text.includes(query.toLocaleLowerCase()))return false;
if(competition&&p.competition!==competition||team&&p.team!==team)return false;
if(position==="goalkeeper"&&!p.goalkeeper||position==="outfield"&&p.goalkeeper)return false;
if(ageMin!==""&&(p.age==null||p.age<Number(ageMin))||ageMax!==""&&(p.age==null||p.age>Number(ageMax)))return false;
if(minutesMin!==""&&p.minutes<Number(minutesMin)||minutesMax!==""&&p.minutes>Number(minutesMax))return false;
if(metric&&(metricMin!==""&&Number(p[metric]||0)<Number(metricMin)||metricMax!==""&&Number(p[metric]||0)>Number(metricMax)))return false;
if(preset==="young"&&(p.age==null||p.age>21||!possibleMinutes||p.minutes<possibleMinutes*.60))return false;
if(preset==="veteran"&&(p.age==null||p.age<30||!possibleMinutes||p.minutes>possibleMinutes*.35))return false;
if(preset==="starter"&&(!teamMatches||p.starts<3||p.starts<teamMatches*.70))return false;
if(preset==="regularsub"&&(!teamMatches||p.subIns<3||p.subIns<teamMatches*.50||p.starts>p.subIns))return false;
if(preset==="supersub"&&(p.subIns<3||(p.subGoals||0)<1))return false;
if(preset==="scorer"&&(p.minutes<450||p.goalsPer90<.5))return false;
return true}).sort((a,b)=>{const x=a[sort],y=b[sort];const n=typeof x==="number"||typeof y==="number" ? (Number(x??-1)-Number(y??-1)) : String(x||"").localeCompare(String(y||""),"nl");return desc?-n:n}),[players,query,competition,team,ageMin,ageMax,minutesMin,minutesMax,metric,metricMin,metricMax,preset,sort,desc,matchesByCompetition,position]);
function exportMissingBirthyears(){
const missing=players.filter(p=>p.birthYear==null).sort((a,b)=>a.team.localeCompare(b.team,"nl")||a.name.localeCompare(b.name,"nl"));
const unique=new Map();
for(const p of missing){const key=p.team.toLocaleLowerCase()+"|"+p.name.toLocaleLowerCase();if(!unique.has(key))unique.set(key,p)}
const quote=v=>String(v??"").includes(";")||String(v??"").includes('"')?'"'+String(v).replaceAll('"','""')+'"':String(v??"");
const rows=[["ClubRBFA","Naam","Geboortejaar"],...[...unique.values()].map(p=>[p.team,p.name,""])];
const text="\uFEFF"+rows.map(row=>row.map(quote).join(";")).join("\r\n");
const blob=new Blob([text],{type:"text/csv;charset=utf-8"});
const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="ontbrekende_geboortejaren.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
function csv(){const exported=columns.filter(([key])=>visibleColumns.includes(key));const head=["Reeks",...exported.map(([,label])=>label)];const csvcell=v=>'"'+String(v??"").replaceAll('"','""')+'"';const lines=[head,...filtered.map(p=>[p.competitionName,...exported.map(([key])=>key==="cleanSheets"&&!p.goalkeeper?"":p[key])])];const blob=new Blob([lines.map(row=>row.map(csvcell).join(";")).join("\n")],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="scouting-selectie.csv";a.click();URL.revokeObjectURL(a.href)}
function toggleColumn(key){setVisibleColumns(current=>current.includes(key)?(current.length>1?current.filter(x=>x!==key):current):columns.filter(([id])=>current.includes(id)||id===key).map(([id])=>id))}
function order(key){if(sort===key)setDesc(!desc);else{setSort(key);setDesc(key!=="name"&&key!=="team")}}
return <div className="shell"><aside className="sidebar"><div className="brand"><span className="logo">◉</span><div><strong>SCOUTING<span> RADAR</span></strong><small>RBFA • 2026/27</small></div></div><div className="section-label">SCOUTINGPROFIELEN</div><nav>{presets.map(p=><button title={p.criteria} className={preset===p.id?"active":""} onClick={()=>setPreset(p.id)} key={p.id}>{p.label}<small>{p.id==="all"?"":p.criteria}</small></button>)}</nav><div className="sidebar-bottom"><span className="live-dot"/> Beschrijvende spelersdata <small>Geen simulaties of voorspellingen</small></div></aside><main className="content"><header><div><div className="eyebrow">TALENT IDENTIFICATIE / SCOUTING</div><h1>Ontdek je volgende <em>target.</em></h1><p>Filter spelers over verschillende competities en vind interessante scoutingprofielen.</p></div><div className="header-actions"><button className="theme-button" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}>{theme==="dark"?"☀ Licht thema":"☾ Donker thema"}</button><label className="theme-button upload-button">↑ Upload resultaten CSV<input type="file" accept=".csv,text/csv" onChange={uploadBirthyears} hidden/></label><button className="theme-button" onClick={exportMacroMissing} disabled={!players.some(p=>p.birthYear==null)}>↓ MacroDroid-zoeklijst</button><button className="theme-button" onClick={exportBirthyearDatabase}>↓ Master geboortejaren</button><button className="export" onClick={exportMissingBirthyears} disabled={!players.some(p=>p.birthYear==null)}>↓ Ontbrekende geboortejaren</button><button className="export" onClick={csv} disabled={!filtered.length}>↓ Exporteer selectie</button></div></header><section className="birth-status"><strong>Geboortejaren:</strong> Upload een MacroDroid-resultatenbestand (Ploeg;Naam;Geboortejaar;Gevonden). De leeftijd wordt direct aangepast en je kunt een nieuwe zoeklijst downloaden. <strong>Let op:</strong> de upload bewaart wijzigingen lokaal in deze browser; download de master-CSV en commit die naar GitHub voor blijvende verwerking. {birthNotice&&<p role="status">{birthNotice}</p>}</section><div className="stats"><div><small>SPELERS IN SELECTIE</small><strong>{filtered.length}</strong><span>van {players.length} spelers</span></div><div><small>COMPETITIES</small><strong>{data.competitions?.length||0}</strong><span>ingeladen reeksen</span></div><div><small>GESPEELDE WEDSTRIJDEN</small><strong>{(data.competitions||[]).reduce((a,b)=>a+b.played,0)}</strong><span>over alle reeksen</span></div><div><small>LEEUFTIJD BEKEND</small><strong>{players.length?Math.round(100*players.filter(x=>x.age!=null).length/players.length):0}%</strong><span>gekoppelde geboortejaren</span></div></div><section className="filters"><div className="preset-info"><div className="eyebrow">ACTIEF SCOUTINGPROFIEL</div><h2>{activePreset.label}</h2><p>{activePreset.description}</p><strong>Criteria: {activePreset.criteria}</strong><small>Percentages zijn gebaseerd op gespeelde wedstrijden in de geselecteerde reeks (90 minuten per wedstrijd, 16 ploegen). Onbekende leeftijden worden uitgesloten uit leeftijdsfilters. Je eigen filters blijven bijkomend actief.</small></div><div className="filterheading"><h2>Spelersfilter</h2><button className="clear" onClick={()=>{setQuery("");setCompetition("");setTeam("");setAgeMin("");setAgeMax("");setMinutesMin("");setMinutesMax("");changePosition("all");setMetric("");setMetricMin("");setMetricMax("");setPreset("all")}}>Wis filters ↺</button></div><div className="filtergrid"><label className="wide">Zoek speler, ploeg of rugnummer<input placeholder="Zoek op naam, team of rugnummer…" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Reeks<select value={competition} onChange={e=>{setCompetition(e.target.value);setTeam("")}}><option value="">Alle reeksen</option>{(data.competitions||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Ploeg<select value={team} onChange={e=>setTeam(e.target.value)}><option value="">Alle ploegen</option>{teams.map(t=><option key={t}>{t}</option>)}</select></label><label>Type speler<select value={position} onChange={e=>changePosition(e.target.value)}><option value="all">Alle spelers</option><option value="goalkeeper">Doelmannen</option><option value="outfield">Veldspelers</option></select></label><label>Leeftijd vanaf<input type="number" min="0" placeholder="Min." value={ageMin} onChange={e=>setAgeMin(e.target.value)}/></label><label>Leeftijd t/m<input type="number" min="0" placeholder="Max." value={ageMax} onChange={e=>setAgeMax(e.target.value)}/></label><label>Minuten vanaf<input type="number" min="0" placeholder="Min." value={minutesMin} onChange={e=>setMinutesMin(e.target.value)}/></label><label>Minuten t/m<input type="number" min="0" placeholder="Max." value={minutesMax} onChange={e=>setMinutesMax(e.target.value)}/></label><label>Extra statistiek<select value={metric} onChange={e=>setMetric(e.target.value)}><option value="">Geen</option>{fields.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Minimum waarde<input type="number" placeholder="Min." value={metricMin} disabled={!metric} onChange={e=>setMetricMin(e.target.value)}/></label><label>Maximum waarde<input type="number" placeholder="Max." value={metricMax} disabled={!metric} onChange={e=>setMetricMax(e.target.value)}/></label></div></section><section className="results"><div className="resultheading"><h2>Spelersoverzicht <span>{filtered.length}</span></h2><div className="table-actions"><span>Klik op een kolom om te sorteren</span><button className="columns-button" onClick={()=>setColumnPicker(!columnPicker)} aria-expanded={columnPicker}>⚙ Kolommen ({visibleColumns.length})</button></div></div>{columnPicker&&<div className="column-picker"><div className="column-picker-head"><strong>Zichtbare kolommen · {position==="goalkeeper"?"Doelmannen":position==="outfield"?"Veldspelers":"Alle spelers"}</strong><button onClick={()=>setVisibleColumns(defaultForPosition(position))}>Standaard</button><button onClick={()=>setVisibleColumns(columns.map(([id])=>id))}>Alles tonen</button></div><div className="column-options">{columns.map(([key,label])=><label key={key}><input type="checkbox" checked={visibleColumns.includes(key)} onChange={()=>toggleColumn(key)}/>{label}</label>)}</div></div>}{loading?<div className="empty">Data laden…</div>:!players.length?<div className="empty"><h3>Dashboard klaar voor data</h3><p>Start de workflow <b>Update scouting data</b> om de eerste reeks op te halen.</p></div>:<div className="tablewrap"><table><thead><tr>{columns.filter(([key])=>visibleColumns.includes(key)).map(([key,label])=><th key={key} onClick={()=>order(key)}>{label}{sort===key?(desc?" ↓":" ↑"):""}</th>)}</tr></thead><tbody>{filtered.slice(0,1000).map((p,i)=><tr key={p.competition+p.team+p.name+i} onClick={()=>setSelected(p)}>{columns.filter(([key])=>visibleColumns.includes(key)).map(([key])=><td key={key} className={key==="minutes"?"emphasis":""}>{key==="name"?<><strong>{p.name}</strong><small>{p.competitionName}</small></>:key==="goalkeeper"?(p.goalkeeper?"Ja":"Nee"):key==="cleanSheets"&&!p.goalkeeper?"—":(p[key]??"—")}</td>)}</tr>)}</tbody></table></div>}{filtered.length>1000&&<p>Enkel de eerste 1.000 resultaten getoond. Exporteer de volledige selectie als CSV.</p>}</section><footer>RBFA Scouting Radar • Geboortejaren aanvullen: download het CSV-bestand, vul de kolom Geboortejaar in en upload het naar data_raw/birthyears.csv in deze GitHub-repo. ClubRBFA is voorlopig de ploegnaam uit RBFA en moet eventueel afgestemd worden op de clubcode in het bronbestand. • Laatste gegevens: {data.updatedAt?new Date(data.updatedAt).toLocaleString("nl-BE"):"Nog niet geladen"} • Leeftijd op basis van geboortejaar (benadering)</footer></main>{selected&&<div className="overlay" onClick={()=>setSelected(null)}><article className="drawer" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}>✕</button><div className="eyebrow">SPELERSFICHE</div><h2>{selected.name}</h2><p>{selected.team} · {selected.competitionName}</p><div className="detailgrid">{[["Rugnummer",selected.number||"—"],["Leeftijd",selected.age??"Onbekend"],...fields.map(([k,v])=>[v,selected[k]])].map(([k,v])=><div key={k}><small>{k}</small><strong>{v}</strong></div>)}</div><h3>Wedstrijdbewijs</h3><p>{selected.matchUrls.length} geregistreerde wedstrijdvermeldingen</p><div className="matchlinks">{selected.matchUrls.slice(-12).map((url,i)=><a href={url} target="_blank" rel="noreferrer" key={i}>RBFA-wedstrijd ↗</a>)}</div></article></div>}</div>
}
createRoot(document.getElementById("root")).render(<App/>);
