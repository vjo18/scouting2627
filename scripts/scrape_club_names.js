// Discover RBFA club IDs and official names from match and club pages.
// Run: npm run scrape:clubs
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import puppeteer from "puppeteer";

if (process.platform === "linux" && !process.env.DISPLAY && process.env.RBFA_XVFB_CHILD !== "1") {
  const result = spawnSync("xvfb-run", ["-a", process.execPath, process.argv[1]], {
    stdio: "inherit", env: { ...process.env, RBFA_XVFB_CHILD: "1" }
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const path = "data_raw/team_club_mapping.csv";
const calendar = fs.readdirSync("data_raw",{withFileTypes:true}).filter(x=>x.isDirectory()).flatMap(x=>{const p="data_raw/"+x.name+"/match_calendar.json";return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,"utf8")):[];});
const split = (line) => line.split(";");
const original = fs.existsSync(path)?fs.readFileSync(path, "utf8").trim().split(/\r?\n/).slice(1).map(split):[];
const entries = new Map(original.map(([team, club, id, number]) => [team, { team, club, id, number }]));
for(const match of calendar)for(const team of [match.homeTeam,match.awayTeam])if(team&&!entries.has(team))entries.set(team,{team,club:"",id:"",number:""});
console.log(`Discovering official RBFA names for ${entries.size} teams across ${calendar.length} fixtures`);
const browser = await puppeteer.launch({ headless: false, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage();
page.setDefaultNavigationTimeout(15000);
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const normalize = s => String(s||"").trim().toLocaleLowerCase("nl").replace(/\s+/g," ");
const byName = new Map([...entries.values()].map(e=>[normalize(e.team),e]));
try {
  const unresolved = () => [...entries.values()].filter(e => !e.id);
  // Greedy set-cover: prefer matches between TWO clubs whose IDs are still unknown.
  // A fixture is visited only as needed; do not crawl an entire league calendar.
  const remaining = [...new Map(calendar.filter(m=>m.url).map(m=>[m.url,m])).values()];
  let pagesVisited=0;
  const attempts=new Map();
  const maxAttemptsPerTeam=3;
  const maxFixturePages=Math.min(180,entries.size*2);
  while (unresolved().length && remaining.length && pagesVisited<maxFixturePages) {
    const unknown = new Set(unresolved().filter(e=>(attempts.get(e.team)||0)<maxAttemptsPerTeam).map(e=>e.team));
    if (!unknown.size) break;
    let bestIndex=-1, bestScore=0;
    for (let i=0;i<remaining.length;i++) {
      const m=remaining[i];
      const score=Number(unknown.has(m.homeTeam))+Number(unknown.has(m.awayTeam));
      if(score>bestScore){bestScore=score;bestIndex=i;if(score===2)break;}
    }
    if(bestIndex<0)break;
    const [match]=remaining.splice(bestIndex,1);
    pagesVisited++;
    for(const team of [match.homeTeam,match.awayTeam])if(unknown.has(team))attempts.set(team,(attempts.get(team)||0)+1);
    if (pagesVisited===1 || pagesVisited%5===0) console.log(`Progress: ${pagesVisited} match pages visited; ${unresolved().length} club IDs missing`);
    if (!match.url) continue;
    try {
      await page.goto(match.url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('a[href*="/club/"]',{timeout:9000}).catch(()=>null);
      const links = await page.evaluate(() => [...document.querySelectorAll('a[href*="/club/"][href*="/ploeg/"]')].map(a => ({
        team: a.textContent.trim().replace(/\s+/g, " "),
        href: a.getAttribute("href")
      })));
      if (pagesVisited<=3) console.log("DEBUG match",match.url,"links found",links.length,"samples",JSON.stringify(links.slice(0,4)));
      for (const link of links) {
        const id = link.href.match(/\/club\/(\d+)\/ploeg\//)?.[1];
        const entry = byName.get(normalize(link.team));
        if (entry && id) entry.id = id;
      }
    } catch (error) { console.warn("Wedstrijd overgeslagen:", match.url, error.message); }
  }
  console.log(`Visited ${pagesVisited} fixture pages for ${entries.size-unresolved().length}/${entries.size} club IDs; ${unresolved().length} unresolved.`);
  if (pagesVisited>5 && entries.size-unresolved().length<=original.filter(r=>r[2]).length) throw new Error("No new RBFA club IDs found. Check DEBUG link samples and selectors before scraping further.");
  for (const entry of entries.values()) {
    if (!entry.id || (entry.club && entry.number)) continue;
    try {
      await page.goto(`https://www.rbfa.be/nl/club/${entry.id}/info`, { waitUntil: "domcontentloaded" });
      await wait(600);
      const info = await page.evaluate(() => {
        const text = document.body.innerText;
        const number = text.match(/Stamnummer\s*(\d+)/i)?.[1] || "";
        const candidates = [...document.querySelectorAll("h2")].map(e => e.textContent.trim()).filter(Boolean);
        const subtitle = [...document.querySelectorAll("*")].find(e => e.children.length === 0 && /Stamnummer\\s*\\d+/i.test(e.textContent || ""));
        const nearby = subtitle?.parentElement?.querySelector("h2")?.textContent?.trim()
          || subtitle?.parentElement?.parentElement?.querySelector("h2")?.textContent?.trim()
          || "";
        const titles=[...document.querySelectorAll("h1,[class*=clubName],[class*=club-name],[class*=clubTitle]")].map(e=>e.textContent.trim()).filter(Boolean);
        const og=document.querySelector('meta[property="og:title"]')?.content||"";
        const docTitle=document.title||"";
        return { number, candidates, nearby, titles, og, docTitle };
      });
      // Club headings may change: only accept when exactly one plausible heading exists.
      const headings = info.candidates.filter(x =>
        x.length > 4 && !/^(info|club|ploegen|kalender|uitslagen|contact|adres|algemeen)$/i.test(x)
      );
      // The RBFA club info page shows the club name in its main h2.
      // Only accept an unambiguous heading; otherwise leave it for manual review.
      if (info.nearby) entry.club = info.nearby;
      else if (headings.length === 1) entry.club = headings[0];
      else {
        // Some RBFA club pages show the club title in an h1 or outside
        // the stamnummer container. Prefer a heading matching the team name.
        const fallback = await page.evaluate(() =>
          [...document.querySelectorAll("h1,h2,h3")]
            .map(e => e.textContent.trim())
            .filter(Boolean)
        );
        const expected = entry.team.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^K/, "");
        const matches = fallback.filter(x => {
          const normalized = x.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^K/, "");
          return normalized.includes(expected.replace(/A$/, "")) || expected.includes(normalized);
        });
        if (matches.length === 1) entry.club = matches[0];
        else {
          const names=[...new Set([...info.titles,...(info.og?[info.og]:[]),...(info.docTitle?[info.docTitle]:[])].map(v=>v.replace(/\s*[|–-]\s*(RBFA|Voetbal Vlaanderen).*$/i,"").trim()).filter(v=>v.length>4&&!/^(RBFA|Club|Info|Welkom)/i.test(v)))];
          if(names.length===1)entry.club=names[0];
          else console.warn("Clubnaam niet bevestigd:",entry.team,"clubId",entry.id,"candidates",JSON.stringify(names.slice(0,5)));
        }
      }
      if (info.number) entry.number = info.number;
      console.log(entry.team, "=>", entry.club || "(naam controleren)", entry.id);
    } catch (error) { console.warn("Club overgeslagen:", entry.team, error.message); }
  }
} finally { await browser.close(); }
const escape = value => String(value || "").replace(/[;\r\n]/g, " ").trim();
fs.writeFileSync(path, "TeamRepo;ClubRBFA;ClubID;Stamnummer\n" +
  [...entries.values()].map(e => [e.team,e.club,e.id,e.number].map(escape).join(";")).join("\n") + "\n");
console.log("Koppelingen bijgewerkt:", path);
