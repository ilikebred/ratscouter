import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "frc2026_scouting_v4";
const SB_BASE   = "https://api.statbotics.io/v2";
const TBA_BASE  = "https://www.thebluealliance.com/api/v3";
const YEAR = 2026;

const defaultData = {
  teams: {}, picklist: {}, sbCache: {}, tbaRankings: {}, tbaPredictions: {},
  settings: { tbaKey: "", eventKey: "" }
};

async function loadData() {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    return r ? JSON.parse(r) : defaultData;
  } catch {
    return { ...defaultData };
  }
}

async function saveData(d) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {}
}
const TOWER_PTS   = { None: 0, L1: 10, L2: 20, L3: 30 };
const PICK_STATUS = { "": "—", watch: "👀 Watch", pick: "✅ Pick", dnp: "❌ DNP" };
const RESULT_OPTS = { "": "—", win: "✅ Win", loss: "❌ Loss", tie: "🤝 Tie" };
const TABS = ["Scout", "Teams", "Rankings", "Compare", "Picklist", "Settings"];

function calcAvg(matches) {
  if (!matches?.length) return null;
  const n = matches.length, sum = f => matches.reduce((a, m) => a + (Number(m[f]) || 0), 0);
  const wins   = matches.filter(m => m.result === "win").length;
  const losses = matches.filter(m => m.result === "loss").length;
  const ties   = matches.filter(m => m.result === "tie").length;
  return {
    n, wins, losses, ties,
    autoFuel:  sum("autoFuel")  / n,
    teleFuel:  sum("teleFuel")  / n,
    totalFuel: (sum("autoFuel") + sum("teleFuel")) / n,
    towerPts:  matches.reduce((a, m) => a + (TOWER_PTS[m.climbEnd] || 0), 0) / n,
    driverAvg: sum("driverSkill") / n,
  };
}

function epa(sb) {
  if (!sb) return {};
  return {
    total:  sb.epa_end   ?? sb.epa?.total_points?.mean,
    auto:   sb.auto_epa_end   ?? sb.epa?.breakdown?.auto_points?.mean,
    tele:   sb.teleop_epa_end ?? sb.epa?.breakdown?.teleop_points?.mean,
    end:    sb.endgame_epa_end ?? sb.epa?.breakdown?.endgame_points?.mean,
    wins:   sb.wins  ?? sb.record?.wins,
    losses: sb.losses ?? sb.record?.losses,
    name:   sb.name  ?? sb.team_name,
  };
}

function epaColor(v, mean = 40, sd = 30) {
  const z = (v - mean) / sd;
  if (z > 2)  return "#60a5fa";
  if (z > 1)  return "#34d399";
  if (z > 0)  return "#a3e635";
  if (z > -1) return "#e2e8f0";
  return "#f87171";
}

async function fetchSB(teamNum) {
  const url = `${SB_BASE}/team_year/${teamNum}/${YEAR}`;
  let raw;
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    raw = await r.json();
  } catch (e) {
    if (e.message?.startsWith("HTTP")) throw e;
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const r2 = await fetch(proxy);
    if (!r2.ok) throw new Error("proxy failed");
    const w = await r2.json();
    raw = JSON.parse(w.contents);
  }
  if (raw?.detail) throw new Error("not found");
  return raw;
}

async function fetchTBA(path, tbaKey) {
  const url = `${TBA_BASE}${path}`;
  const headers = { "X-TBA-Auth-Key": tbaKey, Accept: "application/json" };
  let raw;
  try {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    raw = await r.json();
  } catch (e) {
    if (e.message?.startsWith("HTTP")) throw e;
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url + (url.includes("?") ? "&" : "?") + `X-TBA-Auth-Key=${tbaKey}`)}`;
    const r2 = await fetch(proxy);
    if (!r2.ok) throw new Error("proxy failed");
    const w = await r2.json();
    raw = JSON.parse(w.contents);
  }
  return raw;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
const IS = { background:"#374151",color:"white",border:"1px solid #4b5563",borderRadius:4,padding:"5px 8px",fontSize:13,width:"100%" };
const CS = { background:"#1e293b",borderRadius:8,padding:14,marginBottom:12,border:"1px solid #334155" };

const Row = ({ label, children }) => (
  <div style={{ display:"flex",alignItems:"center",marginBottom:8,gap:8 }}>
    <div style={{ width:130,fontSize:13,color:"#94a3b8",flexShrink:0 }}>{label}</div>
    <div style={{ flex:1 }}>{children}</div>
  </div>
);

function SBox({ label, val, color = "#e2e8f0", small }) {
  return (
    <div style={{ background:"#0f172a",borderRadius:6,padding:"8px 10px",textAlign:"center",flex:1,minWidth:60 }}>
      <div style={{ fontSize: small ? 13 : 17, fontWeight:700, color }}>{val ?? "—"}</div>
      <div style={{ fontSize:11,color:"#64748b",marginTop:2 }}>{label}</div>
    </div>
  );
}

function EPACard({ sb }) {
  if (!sb) return null;
  const { total, auto, tele, end, wins, losses } = epa(sb);
  if (total == null && auto == null) return null;
  return (
    <div style={{ background:"#0f172a",borderRadius:8,padding:12,border:"1px solid #1e3a5f",marginBottom:10 }}>
      <div style={{ fontSize:12,color:"#3b82f6",fontWeight:700,marginBottom:8 }}>📊 Statbotics EPA — 2026</div>
      <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
        <SBox label="Total EPA"   val={total?.toFixed(1)} color={total != null ? epaColor(total) : "#94a3b8"} />
        <SBox label="Auto EPA"    val={auto?.toFixed(1)}  color="#a78bfa" />
        <SBox label="Teleop EPA"  val={tele?.toFixed(1)}  color="#60a5fa" />
        <SBox label="Endgame EPA" val={end?.toFixed(1)}   color="#34d399" />
        {wins != null && <SBox label="SB Record" val={`${wins}-${losses}`} color="#fbbf24" />}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,  setTab]  = useState("Scout");
  const [data, setData] = useState(null);

  useEffect(() => { loadData().then(d => setData({ ...defaultData, ...d, settings: { ...defaultData.settings, ...d.settings } })); }, []);

  const persist = useCallback(nd => { setData(nd); saveData(nd); }, []);
  const cacheSB = useCallback((num, sbData) => {
    setData(prev => { const nd = { ...prev, sbCache: { ...prev.sbCache, [num]: sbData } }; saveData(nd); return nd; });
  }, []);

  if (!data) return <div style={{ color:"white",padding:32,textAlign:"center" }}>Loading…</div>;

  const hasEvent = !!(data.settings.tbaKey && data.settings.eventKey);

  return (
    <div style={{ fontFamily:"system-ui,sans-serif",background:"#0f172a",minHeight:"100vh",color:"#e2e8f0" }}>
      <div style={{ background:"#1e293b",padding:"10px 16px",borderBottom:"2px solid #3b82f6",display:"flex",alignItems:"center",gap:10 }}>
        <span style={{ fontWeight:700,fontSize:17,color:"#60a5fa" }}>⚙️ REBUILT</span>
        <span style={{ fontSize:12,color:"#94a3b8" }}>FRC 2026 Scouting</span>
        <div style={{ marginLeft:"auto",display:"flex",gap:6,fontSize:11 }}>
          <span style={{ background:"#0f172a",padding:"2px 7px",borderRadius:10,color: hasEvent ? "#34d399" : "#475569" }}>
            {hasEvent ? "✓ TBA" : "○ TBA"}
          </span>
          <span style={{ background:"#0f172a",padding:"2px 7px",borderRadius:10,color:"#475569" }}>statbotics</span>
        </div>
      </div>
      <div style={{ display:"flex",background:"#1e293b",borderBottom:"1px solid #334155",overflowX:"auto" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:"9px 14px",fontSize:12,fontWeight:600,border:"none",cursor:"pointer",whiteSpace:"nowrap",
            background: tab===t ? "#3b82f6" : "transparent",
            color: tab===t ? "white" : "#94a3b8",
            borderBottom: tab===t ? "2px solid #60a5fa" : "2px solid transparent"
          }}>{t}</button>
        ))}
      </div>
      <div style={{ padding:14,maxWidth:880,margin:"0 auto" }}>
        {tab==="Scout"    && <ScoutTab    data={data} persist={persist} cacheSB={cacheSB} />}
        {tab==="Teams"    && <TeamsTab    data={data} persist={persist} cacheSB={cacheSB} />}
        {tab==="Rankings" && <RankingsTab data={data} persist={persist} />}
        {tab==="Compare"  && <CompareTab  data={data} cacheSB={cacheSB} />}
        {tab==="Picklist" && <PicklistTab data={data} persist={persist} cacheSB={cacheSB} />}
        {tab==="Settings" && <SettingsTab data={data} persist={persist} />}
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ data, persist }) {
  const [tbaKey,   setTbaKey]   = useState(data.settings.tbaKey   || "");
  const [eventKey, setEventKey] = useState(data.settings.eventKey || "");
  const [saved, setSaved] = useState(false);

  const save = () => {
    persist({ ...data, settings: { tbaKey: tbaKey.trim(), eventKey: eventKey.trim().toLowerCase() } });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div style={CS}>
        <div style={{ fontSize:13,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:12 }}>🔑 API Configuration</div>
        <div style={{ marginBottom:10 }}>
          <div style={{ fontSize:12,color:"#94a3b8",marginBottom:4 }}>TBA API Key</div>
          <input style={IS} type="password" placeholder="Get from thebluealliance.com/account" value={tbaKey} onChange={e => setTbaKey(e.target.value)} />
          <div style={{ fontSize:11,color:"#475569",marginTop:3 }}>Generate a Read API key at thebluealliance.com → Account → Read API Keys</div>
        </div>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12,color:"#94a3b8",marginBottom:4 }}>Event Key</div>
          <input style={IS} placeholder="e.g. 2026miket or 2026week0" value={eventKey} onChange={e => setEventKey(e.target.value)} />
          <div style={{ fontSize:11,color:"#475569",marginTop:3 }}>Find in the TBA event URL, e.g. thebluealliance.com/event/<b>2026miket</b></div>
        </div>
        <button onClick={save} style={{ background:"#2563eb",color:"white",border:"none",borderRadius:6,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer" }}>
          Save Settings
        </button>
        {saved && <span style={{ marginLeft:10,color:"#34d399",fontSize:13 }}>✓ Saved!</span>}
      </div>
      <div style={{ ...CS, fontSize:13, color:"#64748b" }}>
        <div style={{ fontWeight:600,color:"#94a3b8",marginBottom:6 }}>What TBA is used for:</div>
        <div>• <b style={{color:"#e2e8f0"}}>Rankings tab</b> — live event standings pulled from TBA</div>
        <div style={{marginTop:4}}>• <b style={{color:"#e2e8f0"}}>Predicted win %</b> — shown when scouting a match (uses TBA predictions)</div>
        <div style={{marginTop:4}}>• Without a TBA key you can still use Statbotics EPA and manual scouting.</div>
      </div>
    </div>
  );
}

// ─── Rankings Tab ─────────────────────────────────────────────────────────────
function RankingsTab({ data, persist }) {
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState("");
  const rankings = data.tbaRankings || {};
  const hasKey = !!(data.settings.tbaKey && data.settings.eventKey);

  const fetch_ = async () => {
    if (!hasKey) { setError("Set your TBA API key and event key in Settings first."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetchTBA(`/event/${data.settings.eventKey}/rankings`, data.settings.tbaKey);
      const rankList = res?.rankings || [];
      const map = {};
      rankList.forEach(r => { map[String(r.team_key).replace("frc","")] = r; });
      persist({ ...data, tbaRankings: map });
    } catch(e) { setError("Failed to fetch rankings: " + e.message); }
    setLoading(false);
  };

  const rows = Object.entries(rankings).sort((a,b) => a[1].rank - b[1].rank);

  return (
    <div>
      <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:12 }}>
        <button onClick={fetch_} disabled={loading} style={{ background:"#2563eb",color:"white",border:"none",borderRadius:6,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer" }}>
          {loading ? "Fetching…" : "🔄 Fetch Rankings"}
        </button>
        {data.settings.eventKey && <span style={{ fontSize:12,color:"#64748b" }}>Event: <b style={{color:"#94a3b8"}}>{data.settings.eventKey}</b></span>}
        {!hasKey && <span style={{ fontSize:12,color:"#f97316" }}>⚠ Configure TBA in Settings</span>}
      </div>
      {error && <div style={{ background:"#450a0a",borderRadius:6,padding:10,fontSize:13,color:"#f87171",marginBottom:10 }}>{error}</div>}

      {rows.length > 0 && (
        <div style={CS}>
          <div style={{ fontSize:12,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10 }}>
            Event Rankings — {data.settings.eventKey}
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"36px 80px 1fr repeat(4,60px)",gap:4,fontSize:11,color:"#64748b",fontWeight:600,paddingBottom:6,borderBottom:"1px solid #334155",marginBottom:6 }}>
            <div>#</div><div>Team</div><div>Name</div><div style={{textAlign:"center"}}>W</div><div style={{textAlign:"center"}}>L</div><div style={{textAlign:"center"}}>T</div><div style={{textAlign:"center"}}>RPs</div>
          </div>
          {rows.map(([num, r]) => {
            const isScouted = !!data.teams[num];
            const rec = r.record || {};
            return (
              <div key={num} style={{
                display:"grid",gridTemplateColumns:"36px 80px 1fr repeat(4,60px)",gap:4,
                padding:"6px 0",borderBottom:"1px solid #1e293b",alignItems:"center",fontSize:13,
                background: isScouted ? "#0d1f2d" : "transparent"
              }}>
                <div style={{ fontWeight:700,color:"#64748b" }}>#{r.rank}</div>
                <div style={{ fontWeight:700,color: isScouted ? "#60a5fa" : "#e2e8f0" }}>{num}</div>
                <div style={{ color:"#94a3b8",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                  {isScouted && <span style={{ fontSize:10,color:"#22c55e",marginRight:4 }}>●</span>}
                  {epa(data.sbCache[num]).name || "—"}
                </div>
                <div style={{ textAlign:"center",color:"#34d399" }}>{rec.wins ?? "—"}</div>
                <div style={{ textAlign:"center",color:"#f87171" }}>{rec.losses ?? "—"}</div>
                <div style={{ textAlign:"center",color:"#94a3b8" }}>{rec.ties ?? "—"}</div>
                <div style={{ textAlign:"center",fontWeight:700,color:"#fbbf24" }}>{r.extra_stats?.[0]?.toFixed(0) ?? r.qual_average?.toFixed(1) ?? "—"}</div>
              </div>
            );
          })}
          <div style={{ fontSize:11,color:"#475569",marginTop:8 }}>🟢 = team you have scouted</div>
        </div>
      )}
      {rows.length === 0 && !loading && (
        <div style={{ color:"#475569",textAlign:"center",marginTop:40,fontSize:14 }}>
          {hasKey ? "Press Fetch Rankings to load event standings." : "Configure your TBA API key and event key in Settings."}
        </div>
      )}
    </div>
  );
}

// ─── Scout Tab ────────────────────────────────────────────────────────────────
function ScoutTab({ data, persist, cacheSB }) {
  const blank = { teamNum:"",matchNum:"",alliance:"red",result:"",autoFuel:"",autoClimb:false,teleFuel:"",climbEnd:"None",defense:false,driverSkill:"3",notes:"" };
  const [form,      setForm]      = useState(blank);
  const [sb,        setSb]        = useState(null);
  const [sbLoading, setSbLoading] = useState(false);
  const [sbErr,     setSbErr]     = useState("");
  const [pred,      setPred]      = useState(null);
  const [predLoad,  setPredLoad]  = useState(false);
  const [msg,       setMsg]       = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const lookup = async () => {
    const t = form.teamNum.trim();
    if (!t) return;
    setSb(null); setSbErr("");
    if (data.sbCache[t]) { setSb(data.sbCache[t]); }
    else {
      setSbLoading(true);
      try { const d = await fetchSB(t); cacheSB(t, d); setSb(d); }
      catch(e) { setSbErr(e.message); }
      setSbLoading(false);
    }
    // fetch match prediction if event configured
    if (data.settings.tbaKey && data.settings.eventKey && form.matchNum) fetchPred(t, form.matchNum);
  };

  const fetchPred = async (teamNum, matchNum) => {
    if (!data.settings.tbaKey || !data.settings.eventKey) return;
    setPredLoad(true); setPred(null);
    try {
      const preds = await fetchTBA(`/event/${data.settings.eventKey}/predictions`, data.settings.tbaKey);
      const mp = preds?.match_predictions?.qual;
      if (!mp) { setPredLoad(false); return; }
      // find match key like 2026miket_qm12
      const mk = `${data.settings.eventKey}_qm${matchNum}`;
      const matchPred = mp[mk];
      if (matchPred) {
        // find which alliance team is on
        const alliance = form.alliance || "red";
        const winProb = alliance === "red" ? matchPred.red?.winning_probability : matchPred.blue?.winning_probability;
        setPred({ winProb: winProb ?? matchPred.winning_alliance === alliance ? 0.7 : 0.3, matchKey: mk });
      }
    } catch {}
    setPredLoad(false);
  };

  useEffect(() => {
    if (form.matchNum && form.teamNum && data.settings.tbaKey) fetchPred(form.teamNum, form.matchNum);
  }, [form.matchNum, form.alliance]);

  const submit = () => {
    if (!form.teamNum || !form.matchNum) { setMsg("Team # and Match # required"); return; }
    const t = form.teamNum.trim();
    const teams = { ...data.teams };
    if (!teams[t]) teams[t] = { matches: [] };
    teams[t].matches.push({ ...form, ts: Date.now() });
    persist({ ...data, teams });
    setMsg(`✓ Match ${form.matchNum} logged for Team ${t}`);
    setForm(f => ({ ...blank, teamNum: f.teamNum }));
    setSb(data.sbCache[t] || sb);
    setTimeout(() => setMsg(""), 2500);
  };

  const winPct = pred?.winProb != null ? Math.round(pred.winProb * 100) : null;
  const pctColor = winPct == null ? "#94a3b8" : winPct >= 70 ? "#34d399" : winPct >= 50 ? "#fbbf24" : "#f87171";

  return (
    <div>
      {/* Match info + prediction */}
      <div style={CS}>
        <div style={{ fontSize:12,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10 }}>Match Info</div>
        <Row label="Team Number">
          <div style={{ display:"flex",gap:6 }}>
            <input style={IS} placeholder="e.g. 254" value={form.teamNum}
              onChange={e => { set("teamNum", e.target.value); setSb(null); setSbErr(""); setPred(null); }}
              onKeyDown={e => e.key === "Enter" && lookup()} />
            <button onClick={lookup} style={{ background:"#1d4ed8",color:"white",border:"none",borderRadius:4,padding:"5px 12px",fontSize:12,cursor:"pointer",whiteSpace:"nowrap" }}>
              {sbLoading ? "…" : "Lookup"}
            </button>
          </div>
        </Row>
        <Row label="Match #">
          <input style={IS} placeholder="e.g. 12 (qual num)" value={form.matchNum}
            onChange={e => { set("matchNum", e.target.value); setPred(null); }} />
        </Row>
        <Row label="Alliance">
          <div style={{ display:"flex",gap:6 }}>
            {["red","blue"].map(a => (
              <button key={a} onClick={() => set("alliance", a)} style={{
                flex:1,padding:"5px 0",borderRadius:4,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,
                background: form.alliance===a ? (a==="red"?"#991b1b":"#1e3a8a") : "#374151",
                color: form.alliance===a ? "white" : "#9ca3af"
              }}>{a.charAt(0).toUpperCase()+a.slice(1)}</button>
            ))}
          </div>
        </Row>
        <Row label="Match Result">
          <div style={{ display:"flex",gap:6 }}>
            {[["win","✅ Win","#14532d","#22c55e"],["loss","❌ Loss","#450a0a","#ef4444"],["tie","🤝 Tie","#1c1917","#a8a29e"]].map(([v,l,bg,border]) => (
              <button key={v} onClick={() => set("result", form.result===v ? "" : v)} style={{
                flex:1,padding:"5px 0",borderRadius:4,border:`1px solid ${form.result===v?border:"#374151"}`,cursor:"pointer",fontSize:12,fontWeight:600,
                background: form.result===v ? bg : "#374151", color: form.result===v ? "white" : "#9ca3af"
              }}>{l}</button>
            ))}
          </div>
        </Row>

        {/* Predicted win probability */}
        {(predLoad || pred || data.settings.tbaKey) && (
          <div style={{ marginTop:10,padding:"10px 12px",background:"#0f172a",borderRadius:6,border:"1px solid #1e3a5f",display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ fontSize:12,color:"#3b82f6",fontWeight:600,flex:1 }}>TBA Predicted Win %</div>
            {predLoad && <span style={{ fontSize:12,color:"#60a5fa" }}>Fetching…</span>}
            {!predLoad && winPct != null && (
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                <div style={{ width:120,height:8,background:"#334155",borderRadius:4,overflow:"hidden" }}>
                  <div style={{ width:`${winPct}%`,height:"100%",background:pctColor,borderRadius:4 }} />
                </div>
                <span style={{ fontSize:16,fontWeight:700,color:pctColor }}>{winPct}%</span>
              </div>
            )}
            {!predLoad && winPct == null && <span style={{ fontSize:12,color:"#475569" }}>{data.settings.tbaKey ? "Enter match # above" : "Set TBA key in Settings"}</span>}
          </div>
        )}
      </div>

      {sb    && <EPACard sb={sb} />}
      {sbErr && <div style={{ background:"#451a03",borderRadius:6,padding:"8px 12px",fontSize:12,color:"#f97316",marginBottom:10 }}>⚠️ Statbotics: {sbErr}</div>}

      <div style={CS}>
        <div style={{ fontSize:12,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>🤖 Autonomous</div>
        <Row label="Fuel Scored"><input style={IS} type="number" min="0" placeholder="# balls" value={form.autoFuel} onChange={e => set("autoFuel", e.target.value)} /></Row>
        <Row label="Level 1 Climb">
          <label style={{ display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer" }}>
            <input type="checkbox" checked={form.autoClimb} onChange={e => set("autoClimb", e.target.checked)} />
            Climbed L1 in Auto (+15 pts)
          </label>
        </Row>
      </div>

      <div style={CS}>
        <div style={{ fontSize:12,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>🎮 Teleop</div>
        <Row label="Fuel Scored"><input style={IS} type="number" min="0" placeholder="# balls" value={form.teleFuel} onChange={e => set("teleFuel", e.target.value)} /></Row>
        <Row label="Defense Played">
          <label style={{ display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer" }}>
            <input type="checkbox" checked={form.defense} onChange={e => set("defense", e.target.checked)} />
            Played defense this match
          </label>
        </Row>
      </div>

      <div style={CS}>
        <div style={{ fontSize:12,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>🏔️ Endgame</div>
        <Row label="Climb Level">
          <select value={form.climbEnd} onChange={e => set("climbEnd", e.target.value)} style={IS}>
            {["None","L1","L2","L3"].map(l => <option key={l} value={l}>{l==="None"?"No Climb":`${l} (+${TOWER_PTS[l]} pts)`}</option>)}
          </select>
        </Row>
      </div>

      <div style={CS}>
        <div style={{ fontSize:12,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>📋 Assessment</div>
        <Row label="Driver Skill">
          <div style={{ display:"flex",gap:6 }}>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => set("driverSkill", String(n))} style={{
                width:34,height:34,borderRadius:4,border:"none",cursor:"pointer",fontWeight:700,
                background: form.driverSkill===String(n) ? "#3b82f6" : "#374151",
                color: form.driverSkill===String(n) ? "white" : "#9ca3af"
              }}>{n}</button>
            ))}
          </div>
        </Row>
        <Row label="Notes">
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
            placeholder="Observations, strategy, issues…" style={{ ...IS, resize:"vertical" }} />
        </Row>
      </div>

      <button onClick={submit} style={{ width:"100%",background:"#2563eb",color:"white",border:"none",borderRadius:8,padding:12,fontSize:15,fontWeight:700,cursor:"pointer" }}>
        ➕ Log Match
      </button>
      {msg && <div style={{ marginTop:10,padding:10,borderRadius:6,textAlign:"center",fontSize:13,
        background: msg.startsWith("✓") ? "#14532d" : "#7f1d1d", color:"white" }}>{msg}</div>}
    </div>
  );
}

// ─── Teams Tab ────────────────────────────────────────────────────────────────
function TeamsTab({ data, persist, cacheSB }) {
  const [sel, setSel]   = useState(null);
  const [busy, setBusy] = useState({});

  const teams = Object.entries(data.teams)
    .map(([num, t]) => ({ num, matches: t.matches, avg: calcAvg(t.matches), sb: data.sbCache[num] }))
    .sort((a, b) => (epa(b.sb).total||0) - (epa(a.sb).total||0));

  const fetchOne = async num => {
    if (data.sbCache[num]) return;
    setBusy(b => ({ ...b, [num]:true }));
    try { const d = await fetchSB(num); cacheSB(num, d); } catch {}
    setBusy(b => ({ ...b, [num]:false }));
  };

  const delMatch = (tNum, idx) => {
    const teams = { ...data.teams };
    teams[tNum].matches.splice(idx, 1);
    if (!teams[tNum].matches.length) delete teams[tNum];
    persist({ ...data, teams });
    if (!data.teams[tNum]?.matches?.length) setSel(null);
  };

  const resultBadge = r => {
    if (r==="win")  return <span style={{ color:"#22c55e",fontWeight:700 }}>W</span>;
    if (r==="loss") return <span style={{ color:"#ef4444",fontWeight:700 }}>L</span>;
    if (r==="tie")  return <span style={{ color:"#94a3b8",fontWeight:700 }}>T</span>;
    return <span style={{ color:"#475569" }}>—</span>;
  };

  if (sel) {
    const t = data.teams[sel];
    const avg = calcAvg(t?.matches || []);
    const sb  = data.sbCache[sel];
    const { name } = epa(sb);
    return (
      <div>
        <button onClick={() => setSel(null)} style={{ marginBottom:12,background:"#334155",color:"white",border:"none",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontSize:13 }}>← Back</button>
        <div style={CS}>
          <div style={{ fontSize:19,fontWeight:700,color:"#60a5fa",marginBottom:10 }}>
            Team {sel} {name && <span style={{ fontSize:13,color:"#94a3b8",fontWeight:400 }}>— {name}</span>}
          </div>
          <EPACard sb={sb} />
          {avg && <>
            <div style={{ fontSize:12,color:"#94a3b8",fontWeight:600,marginBottom:8 }}>SCOUTED AVERAGES ({avg.n} matches)</div>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:10 }}>
              <SBox label="Total Fuel"  val={avg.totalFuel.toFixed(1)} />
              <SBox label="Auto Fuel"   val={avg.autoFuel.toFixed(1)}  color="#a78bfa" />
              <SBox label="Tower Pts"   val={avg.towerPts.toFixed(1)}  color="#34d399" />
              <SBox label="Driver"      val={avg.driverAvg.toFixed(1)} color="#fbbf24" />
              <SBox label="Record"      val={`${avg.wins}W ${avg.losses}L${avg.ties?" "+avg.ties+"T":""}`} small color="#94a3b8" />
            </div>
          </>}
          <div style={{ fontSize:12,color:"#94a3b8",fontWeight:600,marginBottom:8 }}>MATCH HISTORY</div>
          {t?.matches.map((m, i) => (
            <div key={i} style={{ background:"#0f172a",borderRadius:6,padding:10,marginBottom:6,fontSize:12 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8 }}>
                <div style={{ flex:1 }}>
                  <span style={{ color:"#60a5fa",fontWeight:700 }}>Match {m.matchNum}</span>
                  <span style={{ marginLeft:6,padding:"1px 6px",borderRadius:3,fontSize:11,background: m.alliance==="red"?"#450a0a":"#1e3a5f",color: m.alliance==="red"?"#fca5a5":"#93c5fd" }}>{m.alliance||"red"}</span>
                  <span style={{ marginLeft:6 }}>{resultBadge(m.result)}</span>
                  <span style={{ color:"#64748b",margin:"0 6px" }}>|</span>
                  Auto: {m.autoFuel||0}{m.autoClimb?" +L1":""}
                  <span style={{ color:"#64748b",margin:"0 6px" }}>|</span>
                  Tele: {m.teleFuel||0}
                  <span style={{ color:"#64748b",margin:"0 6px" }}>|</span>
                  <span style={{ color:"#34d399" }}>Climb: {m.climbEnd}</span>
                  {m.defense && <span style={{ marginLeft:6,color:"#f87171" }}>🛡</span>}
                  {m.notes && <div style={{ color:"#94a3b8",marginTop:3 }}>{m.notes}</div>}
                </div>
                <button onClick={() => delMatch(sel, i)} style={{ background:"#7f1d1d",color:"white",border:"none",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:11 }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
        <span style={{ color:"#94a3b8",fontSize:14,fontWeight:600 }}>{teams.length} Teams Scouted</span>
        <button onClick={() => teams.forEach(t => fetchOne(t.num))}
          style={{ background:"#1d4ed8",color:"white",border:"none",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer" }}>🔄 Fetch All EPA</button>
      </div>
      {!teams.length && <div style={{ color:"#475569",textAlign:"center",marginTop:40,fontSize:14 }}>No teams scouted yet.</div>}
      {teams.map(({ num, avg, sb }) => {
        const { total, name } = epa(sb);
        const rank = data.tbaRankings?.[num];
        return (
          <div key={num} onClick={() => { setSel(num); fetchOne(num); }} style={{
            background:"#1e293b",borderRadius:8,padding:"11px 14px",marginBottom:8,
            border:"1px solid #334155",cursor:"pointer",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"
          }}>
            <div style={{ minWidth:80 }}>
              <div style={{ fontWeight:700,color:"#60a5fa",fontSize:15 }}>Team {num}</div>
              {name && <div style={{ fontSize:11,color:"#64748b" }}>{name}</div>}
              {rank && <div style={{ fontSize:10,color:"#f59e0b" }}>Rank #{rank.rank}</div>}
            </div>
            <div style={{ display:"flex",gap:10,flex:1,flexWrap:"wrap",fontSize:13 }}>
              {total != null && <div style={{ textAlign:"center" }}><div style={{ fontWeight:700,color:epaColor(total) }}>{total.toFixed(1)}</div><div style={{ color:"#64748b",fontSize:11 }}>EPA</div></div>}
              {avg && <>
                <div style={{ textAlign:"center" }}><div style={{ fontWeight:700,color:"white" }}>{avg.totalFuel.toFixed(1)}</div><div style={{ color:"#64748b",fontSize:11 }}>Fuel</div></div>
                <div style={{ textAlign:"center" }}><div style={{ fontWeight:700,color:"#34d399" }}>{avg.towerPts.toFixed(1)}</div><div style={{ color:"#64748b",fontSize:11 }}>Tower</div></div>
                <div style={{ textAlign:"center" }}><div style={{ fontWeight:700,color:"#94a3b8",fontSize:12 }}>{avg.wins}W-{avg.losses}L</div><div style={{ color:"#64748b",fontSize:11 }}>Scout Rec</div></div>
              </>}
              {busy[num] && <span style={{ fontSize:11,color:"#60a5fa",alignSelf:"center" }}>Fetching…</span>}
            </div>
            <span style={{ color:"#475569" }}>›</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Compare Tab ──────────────────────────────────────────────────────────────
function CompareTab({ data, cacheSB }) {
  const teamNums = Object.keys(data.teams);
  const [picks, setPicks] = useState(["","",""]);
  const [fetching, setFetching] = useState(false);
  const colors = ["#60a5fa","#34d399","#fbbf24"];

  const set = (i, v) => setPicks(p => { const n=[...p]; n[i]=v; return n; });
  const selected = picks.filter(Boolean).map(p => ({
    num: p, avg: calcAvg(data.teams[p]?.matches||[]), sb: data.sbCache[p],
    rank: data.tbaRankings?.[p]
  }));

  useEffect(() => {
    const go = async () => {
      setFetching(true);
      for (const p of picks.filter(Boolean)) {
        if (!data.sbCache[p]) try { const d = await fetchSB(p); cacheSB(p, d); } catch {}
      }
      setFetching(false);
    };
    if (picks.some(Boolean)) go();
  }, [picks.join(",")]);

  const Bar = ({ val, max, color }) => (
    <div style={{ flex:1,background:"#0f172a",borderRadius:4,height:16,overflow:"hidden" }}>
      <div style={{ width:`${Math.min((val/Math.max(max,0.01))*100,100)}%`,background:color,height:"100%",borderRadius:4,minWidth:val>0?2:0,transition:"width 0.4s" }} />
    </div>
  );

  const epaM = [
    { label:"Total EPA",   fn: s => epa(s.sb).total },
    { label:"Auto EPA",    fn: s => epa(s.sb).auto  },
    { label:"Teleop EPA",  fn: s => epa(s.sb).tele  },
    { label:"Endgame EPA", fn: s => epa(s.sb).end   },
  ];
  const scoutM = [
    { label:"Avg Total Fuel", fn: s => s.avg?.totalFuel },
    { label:"Avg Auto Fuel",  fn: s => s.avg?.autoFuel  },
    { label:"Avg Tower Pts",  fn: s => s.avg?.towerPts  },
    { label:"Driver Skill",   fn: s => s.avg?.driverAvg },
  ];

  const projEPA   = selected.reduce((a,s) => a + (epa(s.sb).total||0), 0);
  const projFuel  = selected.reduce((a,s) => a + (s.avg?.totalFuel||0), 0);
  const projTower = selected.reduce((a,s) => a + (s.avg?.towerPts||0), 0);

  const MetricGroup = ({ title, metrics }) => (
    <div style={CS}>
      <div style={{ fontSize:12,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10 }}>{title}</div>
      {metrics.map(({ label, fn }) => {
        const vals = selected.map((s,i) => ({ num:s.num, val:fn(s)||0, color:colors[i] }));
        const max = Math.max(...vals.map(v => v.val), 0.01);
        return (
          <div key={label} style={{ marginBottom:12 }}>
            <div style={{ fontSize:12,color:"#94a3b8",marginBottom:4 }}>{label}</div>
            {vals.map(({ num, val, color }) => (
              <div key={num} style={{ display:"flex",alignItems:"center",gap:8,marginBottom:3 }}>
                <div style={{ width:60,fontSize:11,color,fontWeight:600 }}>T{num}</div>
                <Bar val={val} max={max} color={color} />
                <div style={{ width:40,textAlign:"right",fontSize:12,color:"white" }}>{val.toFixed(1)}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <div style={{ ...CS,marginBottom:12 }}>
        <div style={{ fontSize:12,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>Select Alliance (up to 3)</div>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
          {[0,1,2].map(i => (
            <select key={i} value={picks[i]} onChange={e => set(i, e.target.value)} style={{ ...IS,flex:1,minWidth:100,border:`2px solid ${picks[i]?colors[i]:"#4b5563"}` }}>
              <option value="">— Robot {i+1} —</option>
              {teamNums.filter(t => !picks.includes(t)||picks[i]===t).map(t => <option key={t} value={t}>Team {t}</option>)}
            </select>
          ))}
        </div>
        {fetching && <div style={{ fontSize:11,color:"#60a5fa",marginTop:6 }}>Fetching EPA…</div>}
      </div>

      {selected.length > 0 && (
        <div style={{ ...CS,marginBottom:12 }}>
          <div style={{ fontSize:12,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>📋 Team Overview</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8 }}>
            {selected.map((s,i) => {
              const { name, wins, losses } = epa(s.sb);
              const r = s.rank;
              return (
                <div key={s.num} style={{ background:"#0f172a",borderRadius:6,padding:10,border:`1px solid ${colors[i]}44` }}>
                  <div style={{ fontWeight:700,color:colors[i],fontSize:14 }}>Team {s.num}</div>
                  {name && <div style={{ fontSize:11,color:"#64748b",marginBottom:4 }}>{name}</div>}
                  {r && <div style={{ fontSize:11,color:"#f59e0b" }}>Event Rank: #{r.rank} ({r.record?.wins}W-{r.record?.losses}L)</div>}
                  {s.avg && <div style={{ fontSize:11,color:"#94a3b8",marginTop:2 }}>Scout: {s.avg.wins}W-{s.avg.losses}L in {s.avg.n} matches</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected.length > 0 && <>
        {selected.some(s => epa(s.sb).total != null) && <MetricGroup title="📊 Statbotics EPA" metrics={epaM} />}
        {selected.some(s => s.avg) && <MetricGroup title="📋 Scouted Metrics" metrics={scoutM} />}
        <div style={CS}>
          <div style={{ fontSize:12,color:"#60a5fa",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10 }}>⚡ Alliance Projection</div>
          <div style={{ display:"flex",gap:8,marginBottom:12,flexWrap:"wrap" }}>
            <SBox label="Combined EPA"    val={projEPA.toFixed(1)}   color={epaColor(projEPA,120,80)} />
            <SBox label="Proj. Fuel"      val={projFuel.toFixed(0)}  />
            <SBox label="Proj. Tower Pts" val={projTower.toFixed(0)} color="#34d399" />
          </div>
          <div style={{ fontSize:12,color:"#94a3b8",fontWeight:600,marginBottom:8 }}>Ranking Point Likelihood</div>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
            {[
              { label:"Energized RP",    desc:"100 fuel",     met: projFuel>=100   },
              { label:"Supercharged RP", desc:"360 fuel",     met: projFuel>=360   },
              { label:"Traversal RP",    desc:"50 tower pts", met: projTower>=50   },
            ].map(({ label, desc, met }) => (
              <div key={label} style={{ flex:1,minWidth:90,background:met?"#14532d":"#1c1917",border:`1px solid ${met?"#22c55e":"#44403c"}`,borderRadius:6,padding:"8px 10px",textAlign:"center" }}>
                <div>{met?"✅":"❌"}</div>
                <div style={{ fontSize:11,fontWeight:600,color:met?"#4ade80":"#78716c",marginTop:2 }}>{label}</div>
                <div style={{ fontSize:10,color:"#57534e" }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </>}
      {selected.length===0 && <div style={{ color:"#475569",textAlign:"center",marginTop:40,fontSize:14 }}>Select teams above to compare.</div>}
    </div>
  );
}

// ─── Picklist Tab ─────────────────────────────────────────────────────────────
function PicklistTab({ data, persist, cacheSB }) {
  const [sort, setSort] = useState("epa");
  const [busy, setBusy] = useState(false);

  const teams = Object.entries(data.teams).map(([num, t]) => ({
    num, avg: calcAvg(t.matches), sb: data.sbCache[num],
    status: data.picklist[num]||"",
    rank: data.tbaRankings?.[num]
  }));

  const sorted = [...teams].sort((a,b) => {
    const ea=epa(a.sb), eb=epa(b.sb);
    if (sort==="epa")   return (eb.total||0)-(ea.total||0);
    if (sort==="auto")  return (eb.auto||0)-(ea.auto||0);
    if (sort==="end")   return (eb.end||0)-(ea.end||0);
    if (sort==="fuel")  return (b.avg?.totalFuel||0)-(a.avg?.totalFuel||0);
    if (sort==="tower") return (b.avg?.towerPts||0)-(a.avg?.towerPts||0);
    if (sort==="rank")  return (a.rank?.rank||999)-(b.rank?.rank||999);
    return 0;
  });

  const setStatus = (num, status) => persist({ ...data, picklist: { ...data.picklist, [num]:status } });

  const fetchAll = async () => {
    setBusy(true);
    for (const { num } of teams) {
      if (!data.sbCache[num]) try { const d = await fetchSB(num); cacheSB(num, d); } catch {}
    }
    setBusy(false);
  };

  const sortBtns = [
    { k:"epa",   label:"Total EPA"   },
    { k:"auto",  label:"Auto EPA"    },
    { k:"end",   label:"End EPA"     },
    { k:"fuel",  label:"Fuel"        },
    { k:"tower", label:"Tower"       },
    { k:"rank",  label:"Event Rank"  },
  ];
  const scBorder = { pick:"#22c55e",dnp:"#ef4444",watch:"#f59e0b","":" #334155" };

  return (
    <div>
      <div style={{ ...CS,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center" }}>
        <span style={{ fontSize:12,color:"#94a3b8" }}>Sort:</span>
        {sortBtns.map(({ k, label }) => (
          <button key={k} onClick={() => setSort(k)} style={{
            padding:"4px 9px",borderRadius:4,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
            background:sort===k?"#3b82f6":"#374151",color:sort===k?"white":"#9ca3af"
          }}>{label}</button>
        ))}
        <button onClick={fetchAll} disabled={busy} style={{ marginLeft:"auto",background:"#1d4ed8",color:"white",border:"none",borderRadius:4,padding:"4px 10px",fontSize:12,cursor:"pointer" }}>
          {busy ? "Fetching…" : "🔄 EPA"}
        </button>
      </div>
      {!sorted.length && <div style={{ color:"#475569",textAlign:"center",marginTop:40,fontSize:14 }}>No teams yet.</div>}
      {sorted.map(({ num, avg, sb, status, rank }, i) => {
        const { total, auto, end, wins, losses, name } = epa(sb);
        return (
          <div key={num} style={{
            background:"#1e293b",borderRadius:8,padding:"9px 12px",marginBottom:6,
            border:`1px solid ${scBorder[status]||"#334155"}`,
            display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"
          }}>
            <div style={{ width:24,textAlign:"center",fontSize:12,fontWeight:700,color:"#475569" }}>#{i+1}</div>
            <div style={{ minWidth:75 }}>
              <div style={{ fontWeight:700,color:"#60a5fa",fontSize:14 }}>Team {num}</div>
              {name && <div style={{ fontSize:10,color:"#64748b",overflow:"hidden",whiteSpace:"nowrap",maxWidth:90,textOverflow:"ellipsis" }}>{name}</div>}
              {rank && <div style={{ fontSize:10,color:"#f59e0b" }}>Rank #{rank.rank}</div>}
              <div style={{ fontSize:10,color:"#475569" }}>{avg?.n||0} match{avg?.n!==1?"es":""}</div>
            </div>
            <div style={{ display:"flex",gap:8,flex:1,flexWrap:"wrap",fontSize:12 }}>
              {total!=null && <div style={{ textAlign:"center" }}><div style={{ fontWeight:700,color:epaColor(total) }}>{total.toFixed(1)}</div><div style={{ color:"#64748b",fontSize:10 }}>EPA</div></div>}
              {auto !=null && <div style={{ textAlign:"center" }}><div style={{ fontWeight:700,color:"#a78bfa" }}>{auto.toFixed(1)}</div><div style={{ color:"#64748b",fontSize:10 }}>Auto</div></div>}
              {end  !=null && <div style={{ textAlign:"center" }}><div style={{ fontWeight:700,color:"#34d399" }}>{end.toFixed(1)}</div><div style={{ color:"#64748b",fontSize:10 }}>Endgame</div></div>}
              {avg && <>
                <div style={{ textAlign:"center" }}><div style={{ fontWeight:700,color:"white" }}>{avg.totalFuel.toFixed(1)}</div><div style={{ color:"#64748b",fontSize:10 }}>Fuel</div></div>
                <div style={{ textAlign:"center" }}><div style={{ fontWeight:700,color:"#94a3b8",fontSize:11 }}>{avg.wins}W-{avg.losses}L</div><div style={{ color:"#64748b",fontSize:10 }}>Record</div></div>
              </>}
              {rank?.record && <div style={{ textAlign:"center" }}><div style={{ fontWeight:700,color:"#f59e0b",fontSize:11 }}>{rank.record.wins}W-{rank.record.losses}L</div><div style={{ color:"#64748b",fontSize:10 }}>Event Rec</div></div>}
            </div>
            <select value={status} onChange={e => setStatus(num, e.target.value)} style={{
              background:"#1e293b",color:"white",border:`1px solid ${scBorder[status]||"#4b5563"}`,
              borderRadius:4,padding:"4px 6px",fontSize:12,cursor:"pointer"
            }}>
              {Object.entries(PICK_STATUS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}