/* ============================================================================
 * app.js — UI, persistence, charts, import/export for Athletic Load Tracker
 * Depends on flags.js (window.LM). No external libraries.
 * ==========================================================================*/
(function () {
  "use strict";
  const LM = window.LM;
  const STORE = "alt_sessions_v1";
  const TOMB = "alt_tombstones_v1";
  const SYNCK = "alt_sync_v1";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const nowISO = () => new Date().toISOString();

  // ---- State / persistence ------------------------------------------------
  let sessions = load();
  let tombstones = loadTomb();
  let syncCfg = loadSync();
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || []; }
    catch (e) { return []; }
  }
  function loadTomb() { try { return JSON.parse(localStorage.getItem(TOMB)) || {}; } catch (e) { return {}; } }
  function loadSync() { try { return JSON.parse(localStorage.getItem(SYNCK)) || {}; } catch (e) { return {}; } }
  function persist() { localStorage.setItem(STORE, JSON.stringify(sessions)); }
  function persistTomb() { localStorage.setItem(TOMB, JSON.stringify(tombstones)); }
  function persistSync() { localStorage.setItem(SYNCK, JSON.stringify(syncCfg)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  const FIELDS = ["date", "sessionType", "duration", "rpe", "totalDistance", "hsr",
    "sprintDistance", "maxSpeed", "accelerations", "avgHR", "maxHR", "whoopStrain",
    "hrv", "restingHR", "sleep", "restorativeSleep", "recoveryPct", "energy", "soreness", "notes"];

  // ---- Tab navigation -----------------------------------------------------
  $$("#tabs .tab").forEach((t) =>
    t.addEventListener("click", () => showView(t.dataset.view)));
  function showView(name) {
    $$("#tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
    $$(".view").forEach((v) => v.classList.remove("active"));
    $("#view-" + name).classList.add("active");
    if (name === "dashboard") renderDashboard();
    if (name === "history") renderHistory();
    if (name === "weekly") renderWeekly();
  }

  // ---- Form ---------------------------------------------------------------
  const form = $("#sessionForm");
  const recalcLoad = () => {
    const r = LM.num($("#f_rpe").value), d = LM.num($("#f_duration").value);
    $("#f_load").value = (r !== null && d !== null) ? r * d : "";
  };
  $("#f_rpe").addEventListener("input", recalcLoad);
  $("#f_duration").addEventListener("input", recalcLoad);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const rec = { id: $("#f_id").value || uid() };
    FIELDS.forEach((f) => { rec[f] = $("#f_" + f).value.trim(); });
    if (!rec.date) { msg("#formMsg", "Date is required", true); return; }
    rec.updatedAt = nowISO();
    const idx = sessions.findIndex((s) => s.id === rec.id);
    if (idx >= 0) sessions[idx] = rec; else sessions.push(rec);
    persist();
    refreshTypeList();
    autoSync();
    form.reset(); $("#f_id").value = ""; $("#logTitle").textContent = "Log a session";
    $("#f_date").value = LM.dkey(new Date());
    msg("#formMsg", idx >= 0 ? "Session updated ✓" : "Session saved ✓");
  });

  $("#resetForm").addEventListener("click", () => {
    form.reset(); $("#f_id").value = ""; $("#logTitle").textContent = "Log a session";
    $("#f_date").value = LM.dkey(new Date());
  });

  function editSession(id) {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    $("#f_id").value = s.id;
    FIELDS.forEach((f) => { $("#f_" + f).value = s[f] ?? ""; });
    recalcLoad();
    $("#logTitle").textContent = "Edit session — " + s.date;
    showView("log");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function deleteSession(id) {
    if (!confirm("Delete this session?")) return;
    sessions = sessions.filter((s) => s.id !== id);
    tombstones[id] = nowISO(); persistTomb();
    persist(); renderHistory(); msg("#historyCount", "");
    autoSync();
  }

  // ---- History table ------------------------------------------------------
  $("#historySearch").addEventListener("input", renderHistory);
  function renderHistory() {
    const q = $("#historySearch").value.toLowerCase();
    const rows = [...sessions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .filter((s) => !q || (s.sessionType || "").toLowerCase().includes(q) || (s.notes || "").toLowerCase().includes(q));
    const body = $("#historyBody");
    body.innerHTML = rows.map((s) => {
      const v = (f, d = "") => (s[f] === "" || s[f] == null ? d : s[f]);
      return `<tr>
        <td>${fmtDate(s.date)}</td><td>${esc(v("sessionType"))}</td>
        <td>${v("duration")}</td><td>${v("rpe")}</td><td>${LM.sessionLoad(s) || ""}</td>
        <td>${v("totalDistance")}</td><td>${v("hsr")}</td><td>${v("sprintDistance")}</td><td>${v("whoopStrain")}</td>
        <td>${v("hrv")}</td><td>${v("restingHR")}</td><td>${v("sleep")}</td><td>${v("recoveryPct")}</td><td>${v("soreness")}</td>
        <td style="text-align:right">
          <button class="btn btn-sm" data-edit="${s.id}">Edit</button>
          <button class="btn btn-sm danger" data-del="${s.id}">✕</button>
        </td></tr>`;
    }).join("");
    $("#historyCount").textContent = `${rows.length} of ${sessions.length} sessions`;
    $$("#historyBody [data-edit]").forEach((b) => b.onclick = () => editSession(b.dataset.edit));
    $$("#historyBody [data-del]").forEach((b) => b.onclick = () => deleteSession(b.dataset.del));
  }

  // ---- Weekly table -------------------------------------------------------
  function renderWeekly() {
    const days = LM.dailyFromSessions(sessions);
    const weeks = LM.weeklySummaries(days).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
    $("#weeklyBody").innerHTML = weeks.map((w) => {
      const n = (v, d = 0) => (v === null || v === undefined ? "—" : (+v).toFixed(d));
      return `<tr>
        <td>${fmtDate(w.weekStart)}</td>
        <td>${Math.round(w.load)}</td>
        <td>${Math.round(w.distance)}</td>
        <td>${Math.round(w.hsr)}</td>
        <td>${Math.round(w.sprint)}</td>
        <td>${n(w.whoopStrain, 1)}</td>
        <td>${n(w.monotony, 2)}</td>
        <td>${Math.round(w.strain)}</td>
        <td>${n(w.avgHRV, 0)}</td>
        <td>${n(w.avgRHR, 0)}</td>
        <td>${n(w.avgSleep, 1)}</td>
        <td>${n(w.avgRecovery, 0)}</td>
        <td>${w.acwr === null ? "—" : w.acwr.toFixed(2)}</td>
        <td class="risk-cell risk-${w.risk}">${w.risk}</td>
      </tr>`;
    }).join("");
  }

  // ---- Dashboard ----------------------------------------------------------
  function renderDashboard() {
    const res = LM.evaluateFlags(sessions);
    const banner = $("#flagBanner"), cards = $("#kpiCards"), list = $("#flagList");
    if (!res.latest) {
      banner.innerHTML = "";
      cards.innerHTML = `<div class="card"><div class="label">No data yet</div><div class="sub">Log a session or import your spreadsheet to begin.</div></div>`;
      list.innerHTML = `<div class="muted">Flags appear once you have data.</div>`;
      ["chartLoad", "chartAcwr", "chartHrv", "chartRecovery"].forEach((id) => clearCanvas(id));
      $("#asOf").textContent = "";
      return;
    }
    const L = res.latestReal;
    $("#asOf").textContent = "Latest entry: " + fmtDate(L.date);

    const lvlWord = { green: "All clear", amber: "Caution — manage load", red: "Action needed" };
    const lvlIcon = { green: "✅", amber: "⚠️", red: "🛑" };
    banner.innerHTML = `<div class="big ${res.overall}">${lvlIcon[res.overall]} <span>${lvlWord[res.overall]} — ${res.flags.filter(f=>f.level!=="green").length} active flag(s)</span></div>`;

    const acwr = res.latest.acwr;
    const acwrBand = acwr === null || !res.latest.acwrReady ? "" :
      acwr > 1.5 || acwr >= 2 ? "red" : (acwr > 1.3 || acwr < 0.8) ? "amber" : "green";
    const curWeek = res.weeks[res.weeks.length - 1];
    cards.innerHTML = [
      kpi("ACWR", acwr === null || !res.latest.acwrReady ? "—" : acwr.toFixed(2),
        acwr === null ? "needs 4 wks data" : "target 0.80–1.30", acwrBand),
      kpi("7-day acute load", Math.round(res.latest.acute), "sRPE units", ""),
      kpi("Chronic (wk avg)", Math.round(res.latest.chronicWeekly), "28-day average", ""),
      kpi("This week load", curWeek ? Math.round(curWeek.load) : "—",
        curWeek && curWeek.wow !== null ? (curWeek.wow >= 0 ? "+" : "") + (curWeek.wow * 100).toFixed(0) + "% vs last wk" : "",
        curWeek && curWeek.wow >= 0.5 ? "red" : curWeek && curWeek.wow >= 0.15 ? "amber" : ""),
      kpi("HRV", L.hrv ?? "—", "latest", ""),
      kpi("Resting HR", L.restingHR ?? "—", "latest", ""),
      kpi("Recovery", L.recoveryPct != null ? L.recoveryPct + "%" : "—", "latest",
        L.recoveryPct == null ? "" : L.recoveryPct < 34 ? "red" : L.recoveryPct < 67 ? "amber" : "green"),
      kpi("Monotony", curWeek ? curWeek.monotony.toFixed(2) : "—", "target <2.0",
        curWeek && curWeek.monotony > 2 ? "amber" : ""),
    ].join("");

    const shown = res.flags.filter((f) => f.level !== "green").length ? res.flags : res.flags;
    list.innerHTML = shown.map((f) => `
      <div class="flag-item">
        <span class="dot ${f.level}"></span>
        <div>
          <div class="ft">${esc(f.title)}</div>
          <div class="fd">${esc(f.detail)}</div>
          <div class="fbasis">${esc(f.basis)}</div>
        </div>
      </div>`).join("");

    drawCharts(res);
  }
  function kpi(label, value, sub, band) {
    return `<div class="card ${band}"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub || ""}</div></div>`;
  }

  // ---- Charts (dependency-free canvas) ------------------------------------
  function drawCharts(res) {
    const series = res.series.slice(-90); // last ~90 days
    const labels = series.map((d) => d.date);
    lineChart("chartLoad", labels, [
      { data: series.map((d) => d.load), color: "#4ea1ff", fill: true, name: "Daily load" },
      { data: series.map((d) => d.acute), color: "#f5a623", name: "7-day acute" },
    ]);
    acwrChart("chartAcwr", labels, series.map((d) => (d.acwrReady ? d.acwr : null)));
    lineChart("chartHrv", labels, [
      { data: series.map((d) => d.hrv), color: "#2fbf71", name: "HRV" },
      { data: series.map((d) => d.restingHR), color: "#ef4d5a", name: "Resting HR", axis: 2 },
    ]);
    lineChart("chartRecovery", labels, [
      { data: series.map((d) => d.recoveryPct), color: "#4ea1ff", name: "Recovery %" },
      { data: series.map((d) => d.sleep), color: "#b388ff", name: "Sleep h", axis: 2 },
    ]);
  }

  function setupCanvas(id) {
    const c = $("#" + id); if (!c) return null;
    const ratio = window.devicePixelRatio || 1;
    const w = c.clientWidth || 320, h = c.height;
    c.width = w * ratio; c.height = h * ratio;
    const ctx = c.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  function clearCanvas(id) { const s = setupCanvas(id); }

  function niceBounds(vals) {
    const v = vals.filter((x) => x !== null && x !== undefined && !isNaN(x));
    if (!v.length) return null;
    let min = Math.min(...v), max = Math.max(...v);
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.1; return { min: min - pad, max: max + pad };
  }

  function lineChart(id, labels, seriesDefs) {
    const s = setupCanvas(id); if (!s) return;
    const { ctx, w, h } = s;
    const padL = 38, padR = 38, padT = 12, padB = 22;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const allA1 = [].concat(...seriesDefs.filter((d) => d.axis !== 2).map((d) => d.data));
    const allA2 = [].concat(...seriesDefs.filter((d) => d.axis === 2).map((d) => d.data));
    const b1 = niceBounds(allA1) || { min: 0, max: 1 };
    const b2 = niceBounds(allA2) || b1;
    const n = labels.length;
    const x = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y1 = (v) => padT + plotH - ((v - b1.min) / (b1.max - b1.min)) * plotH;
    const y2 = (v) => padT + plotH - ((v - b2.min) / (b2.max - b2.min)) * plotH;

    // grid
    ctx.strokeStyle = "#243446"; ctx.lineWidth = 1; ctx.fillStyle = "#6b7e92"; ctx.font = "10px sans-serif";
    for (let g = 0; g <= 4; g++) {
      const yy = padT + (g / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
      const val = b1.max - (g / 4) * (b1.max - b1.min);
      ctx.fillText(Math.round(val), 2, yy + 3);
    }
    // x labels (first/mid/last)
    [0, Math.floor(n / 2), n - 1].forEach((i) => {
      if (i < 0 || i >= n) return;
      ctx.fillText((labels[i] || "").slice(5), x(i) - 12, h - 6);
    });

    seriesDefs.forEach((def) => {
      const yf = def.axis === 2 ? y2 : y1;
      // fill
      if (def.fill) {
        ctx.beginPath(); let started = false;
        def.data.forEach((v, i) => {
          if (v === null || v === undefined || isNaN(v)) return;
          const px = x(i), py = yf(v);
          if (!started) { ctx.moveTo(px, padT + plotH); ctx.lineTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        });
        if (started) { ctx.lineTo(x(lastIdx(def.data)), padT + plotH); ctx.closePath();
          ctx.fillStyle = hexA(def.color, 0.12); ctx.fill(); }
      }
      // line
      ctx.beginPath(); ctx.strokeStyle = def.color; ctx.lineWidth = 1.8; let started = false;
      def.data.forEach((v, i) => {
        if (v === null || v === undefined || isNaN(v)) { started = false; return; }
        const px = x(i), py = yf(v);
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });
    // legend
    let lx = padL;
    ctx.font = "11px sans-serif";
    seriesDefs.forEach((def) => {
      ctx.fillStyle = def.color; ctx.fillRect(lx, padT - 6, 9, 3);
      ctx.fillStyle = "#9fb3c8"; ctx.fillText(def.name, lx + 13, padT - 2);
      lx += ctx.measureText(def.name).width + 30;
    });
  }
  function lastIdx(arr) { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null && !isNaN(arr[i])) return i; return 0; }

  function acwrChart(id, labels, data) {
    const s = setupCanvas(id); if (!s) return;
    const { ctx, w, h } = s;
    const padL = 34, padR = 14, padT = 12, padB = 22;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const min = 0, max = Math.max(2.2, Math.max(...data.filter((v) => v != null), 0) + 0.2);
    const n = labels.length;
    const x = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = (v) => padT + plotH - ((v - min) / (max - min)) * plotH;
    // zones: green 0.8-1.3, amber 1.3-1.5, red >1.5
    const band = (lo, hi, color) => { ctx.fillStyle = color; ctx.fillRect(padL, y(hi), plotW, y(lo) - y(hi)); };
    band(0.8, 1.3, "rgba(47,191,113,.13)");
    band(1.3, 1.5, "rgba(245,166,35,.13)");
    band(1.5, max, "rgba(239,77,90,.13)");
    band(min, 0.8, "rgba(245,166,35,.10)");
    // reference lines
    ctx.strokeStyle = "#36506a"; ctx.setLineDash([4, 3]); ctx.fillStyle = "#7d93a8"; ctx.font = "10px sans-serif";
    [0.8, 1.3, 1.5].forEach((v) => { ctx.beginPath(); ctx.moveTo(padL, y(v)); ctx.lineTo(w - padR, y(v)); ctx.stroke(); ctx.fillText(v.toFixed(1), 4, y(v) + 3); });
    ctx.setLineDash([]);
    // line
    ctx.beginPath(); ctx.strokeStyle = "#e8eef5"; ctx.lineWidth = 1.8; let started = false;
    data.forEach((v, i) => {
      if (v == null || isNaN(v)) { started = false; return; }
      const px = x(i), py = y(Math.min(v, max));
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    });
    ctx.stroke();
    [0, Math.floor(n / 2), n - 1].forEach((i) => { if (i >= 0 && i < n) ctx.fillText((labels[i] || "").slice(5), x(i) - 12, h - 6); });
  }
  function hexA(hex, a) {
    const m = hex.replace("#", ""); const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ---- Import / Export ----------------------------------------------------
  // Header-name -> field mapping (loose matching).
  const HEADER_MAP = [
    [/^date/, "date"], [/session\s*type|^type/, "sessionType"], [/duration/, "duration"],
    [/^rpe|rpe\s*\(/, "rpe"], [/^load|srpe|rpe\s*[×x]/, "load"],
    [/total\s*distance/, "totalDistance"], [/^hsr|high\s*speed/, "hsr"],
    [/sprint\s*distance|^sprint/, "sprintDistance"], [/max\s*speed/, "maxSpeed"],
    [/acceler/, "accelerations"], [/avg\s*hr|average\s*hr/, "avgHR"], [/max\s*hr/, "maxHR"],
    [/whoop|strain/, "whoopStrain"], [/^hrv/, "hrv"], [/resting\s*hr/, "restingHR"],
    [/restorative/, "restorativeSleep"], [/^sleep/, "sleep"], [/recovery/, "recoveryPct"],
    [/^energy/, "energy"], [/soreness/, "soreness"], [/notes/, "notes"],
  ];
  function mapHeader(h) {
    const k = h.toLowerCase().trim();
    // restorative must beat sleep; order in HEADER_MAP handles it except 'sleep' generic
    if (/restorative/.test(k)) return "restorativeSleep";
    for (const [re, field] of HEADER_MAP) if (re.test(k)) return field;
    return null;
  }
  function parseDateCell(s) {
    s = (s || "").trim(); if (!s) return "";
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); // dd/mm/yyyy
    if (m) { let [_, d, mo, y] = m; if (y.length === 2) y = "20" + y; return `${y}-${pad(mo)}-${pad(d)}`; }
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/); // yyyy-mm-dd
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    const dt = new Date(s); return isNaN(dt) ? "" : LM.dkey(dt);
  }
  const pad = (x) => String(x).padStart(2, "0");

  $("#importBtn").addEventListener("click", () => {
    const raw = $("#importBox").value.trim();
    if (!raw) { msg("#importMsg", "Nothing to import", true); return; }
    const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (!lines.length) return;
    const delim = lines[0].includes("\t") ? "\t" : ",";
    let headers = splitLine(lines[0], delim);
    let map = headers.map(mapHeader);
    let start = 1;
    // If first row isn't a header (no 'date' col matched), assume the user's known order
    if (!map.includes("date")) {
      map = ["date", "sessionType", "duration", "rpe", "load", "totalDistance", "hsr",
        "sprintDistance", "maxSpeed", "accelerations", "avgHR", "maxHR", "whoopStrain",
        "hrv", "restingHR", "sleep", "restorativeSleep", "recoveryPct", "energy", "soreness", "notes"];
      start = 0;
    }
    const imported = [];
    for (let i = start; i < lines.length; i++) {
      const cells = splitLine(lines[i], delim);
      const rec = { id: uid() };
      let hasData = false;
      map.forEach((field, ci) => {
        if (!field || field === "load") return; // load is derived
        let val = (cells[ci] ?? "").trim();
        if (field === "date") val = parseDateCell(val);
        rec[field] = val;
        if (val) hasData = true;
      });
      if (rec.date && hasData) { rec.updatedAt = nowISO(); imported.push(rec); }
    }
    if (!imported.length) { msg("#importMsg", "No valid rows found (need a Date in each row)", true); return; }
    if ($("#importReplace").checked) sessions = imported;
    else sessions = sessions.concat(imported);
    persist(); refreshTypeList(); autoSync();
    msg("#importMsg", `Imported ${imported.length} sessions ✓`);
    $("#importBox").value = "";
  });
  function splitLine(line, delim) {
    if (delim === "\t") return line.split("\t");
    // simple CSV with quote handling
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else { if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; }
    }
    out.push(cur); return out;
  }

  $("#exportCsv").addEventListener("click", () => {
    const cols = ["date", "sessionType", "duration", "rpe", "load", "totalDistance", "hsr",
      "sprintDistance", "maxSpeed", "accelerations", "avgHR", "maxHR", "whoopStrain",
      "hrv", "restingHR", "sleep", "restorativeSleep", "recoveryPct", "energy", "soreness", "notes"];
    const head = "Date,Session Type,Duration,RPE,Load,Total Distance,HSR,Sprint Distance,Max Speed,Accelerations,Avg HR,Max HR,Whoop Strain,HRV,Resting HR,Sleep,Restorative Sleep,Recovery %,Energy,Soreness,Notes";
    const rows = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1)).map((s) =>
      cols.map((c) => c === "load" ? LM.sessionLoad(s) : csvCell(s[c])).join(","));
    download("training-load-export.csv", [head, ...rows].join("\n"), "text/csv");
  });
  function csvCell(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  $("#exportJson").addEventListener("click", () =>
    download("training-load-backup.json", JSON.stringify(sessions, null, 2), "application/json"));

  $("#importJson").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("not an array");
        sessions = data.map((s) => ({ id: s.id || uid(), updatedAt: s.updatedAt || nowISO(), ...s }));
        persist(); refreshTypeList(); autoSync(); alert("Restored " + sessions.length + " sessions.");
      } catch (err) { alert("Invalid backup file."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  $("#wipeBtn").addEventListener("click", () => {
    if (!confirm("Erase ALL logged sessions from this browser? Export a backup first if unsure.")) return;
    sessions = []; persist(); refreshTypeList(); renderHistory();
    alert("All data erased.");
  });

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- Cross-device sync (GitHub Gist) ------------------------------------
  const Sync = window.Sync;
  let syncTimer = null, syncing = false;

  function syncFields() { // hydrate inputs from stored config
    $("#syncToken").value = syncCfg.token || "";
    $("#syncGist").value = syncCfg.gistId || "";
    $("#syncAuto").checked = !!syncCfg.auto;
    updateSyncBadge();
  }
  function readSyncInputs() {
    syncCfg.token = $("#syncToken").value.trim();
    syncCfg.gistId = $("#syncGist").value.trim();
    syncCfg.auto = $("#syncAuto").checked;
    persistSync();
  }
  function updateSyncBadge() {
    const badge = $("#syncBadge");
    if (!badge) return;
    if (syncCfg.token && syncCfg.gistId) {
      badge.textContent = syncCfg.auto ? "auto" : "on";
      badge.className = "pill green";
    } else if (syncCfg.token) {
      badge.textContent = "set up";
      badge.className = "pill amber";
    } else { badge.textContent = "off"; badge.className = "pill"; }
  }
  function syncMsg(text, isErr) {
    const el = $("#syncStatus"); if (!el) return;
    el.textContent = text;
    el.style.color = isErr ? "var(--red)" : "var(--green)";
  }

  // Apply a merged envelope back into local state.
  function applyEnvelope(env) {
    sessions = (env.sessions || []).map((s) => (s.updatedAt ? s : { ...s, updatedAt: nowISO() }));
    tombstones = env.tombstones || {};
    persist(); persistTomb();
    refreshTypeList(); renderDashboard();
    if ($("#view-history").classList.contains("active")) renderHistory();
    if ($("#view-weekly").classList.contains("active")) renderWeekly();
  }

  async function doSync({ create = false } = {}) {
    if (syncing) return;
    readSyncInputs();
    if (!syncCfg.token) { syncMsg("Add a GitHub token first.", true); return; }
    syncing = true; syncMsg("Syncing…");
    try {
      const localEnv = Sync.makeEnvelope(sessions, tombstones);
      let remoteEnv = null;
      if (syncCfg.gistId && !create) {
        remoteEnv = await Sync.pullGist(syncCfg.token, syncCfg.gistId);
      }
      const merged = Sync.mergeEnvelopes(localEnv, remoteEnv);
      applyEnvelope(merged);
      const payload = Sync.makeEnvelope(sessions, tombstones);
      if (!syncCfg.gistId || create) {
        syncCfg.gistId = await Sync.createGist(syncCfg.token, payload);
        $("#syncGist").value = syncCfg.gistId;
      } else {
        await Sync.updateGist(syncCfg.token, syncCfg.gistId, payload);
      }
      syncCfg.lastSync = nowISO(); persistSync();
      updateSyncBadge();
      syncMsg(`Synced ✓ ${sessions.length} sessions · ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      syncMsg(err.message || "Sync failed.", true);
    } finally { syncing = false; }
  }

  function autoSync() {
    if (!syncCfg.auto || !syncCfg.token || !syncCfg.gistId) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => doSync(), 1500); // debounce rapid edits
  }

  function bindSync() {
    if (!$("#syncNow")) return;
    syncFields();
    $("#syncNow").onclick = () => doSync();
    $("#syncCreate").onclick = () => doSync({ create: true });
    $("#syncPull").onclick = async () => {
      readSyncInputs();
      if (!syncCfg.token || !syncCfg.gistId) { syncMsg("Need token + Gist ID to pull.", true); return; }
      syncMsg("Pulling…");
      try {
        const remoteEnv = await Sync.pullGist(syncCfg.token, syncCfg.gistId);
        const merged = Sync.mergeEnvelopes(Sync.makeEnvelope(sessions, tombstones), remoteEnv);
        applyEnvelope(merged);
        syncMsg(`Pulled & merged ✓ ${sessions.length} sessions.`);
      } catch (err) { syncMsg(err.message, true); }
    };
    $("#syncVerify").onclick = async () => {
      readSyncInputs();
      if (!syncCfg.token) { syncMsg("Enter a token first.", true); return; }
      syncMsg("Checking…");
      try { const login = await Sync.whoami(syncCfg.token); syncMsg(`Token OK — signed in as ${login}.`); }
      catch (err) { syncMsg(err.message, true); }
    };
    $("#syncForget").onclick = () => {
      if (!confirm("Remove the saved token & Gist ID from this browser? Your local data stays.")) return;
      syncCfg = {}; persistSync(); syncFields(); syncMsg("Token forgotten.");
    };
    ["syncToken", "syncGist"].forEach((id) => $("#" + id).addEventListener("change", readSyncInputs));
    $("#syncAuto").addEventListener("change", () => { readSyncInputs(); updateSyncBadge(); });
  }

  // ---- Misc helpers -------------------------------------------------------
  function refreshTypeList() {
    const types = [...new Set(sessions.map((s) => s.sessionType).filter(Boolean))].sort();
    $("#typeList").innerHTML = types.map((t) => `<option value="${esc(t)}">`).join("");
  }
  function msg(sel, text, isErr) {
    const el = $(sel); if (!el) return; el.textContent = text;
    el.style.color = isErr ? "var(--red)" : "var(--green)";
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 4000);
  }
  function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00"); if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "2-digit" });
  }

  // ---- Science / flag guide content --------------------------------------
  $("#scienceContent").innerHTML = scienceHTML();
  function scienceHTML() {
    return `
    <p>This tool turns your daily log into the same metrics elite GAA and AFL setups use, then raises flags when the research says your risk of injury, illness or non-functional overreaching is rising. Thresholds live in <code>flags.js</code> (<code>LM.CFG</code>) so you can tune them to your own data.</p>

    <h3>How the core numbers are built</h3>
    <ul>
      <li><b>Session load (sRPE)</b> = RPE × duration (min). Summed across all sessions in a day.</li>
      <li><b>Acute load</b> = rolling 7-day sum of daily load.</li>
      <li><b>Chronic load</b> = 28-day average daily load × 7 (a rolling 4-week reference week).</li>
      <li><b>ACWR</b> = acute ÷ chronic (coupled). Needs ~4 weeks of data before it is trustworthy.</li>
      <li><b>Monotony</b> (Foster) = mean daily load ÷ SD of daily load over the week.</li>
      <li><b>Strain</b> (Foster) = weekly load × monotony.</li>
    </ul>

    <h3>The flags &amp; their evidence</h3>
    <table>
      <tr><th>Flag</th><th>Trigger</th><th>Why (literature)</th></tr>
      <tr><td>ACWR danger</td><td>≥ 2.0</td><td>Highest injury odds in elite Gaelic football (Malone et al., 2017).</td></tr>
      <tr><td>ACWR spike</td><td>&gt; 1.5</td><td>Workload spikes &gt;1.5 raised injury risk, especially in less-experienced GAA players.</td></tr>
      <tr><td>ACWR elevated</td><td>1.3–1.5</td><td>1.35–1.50 band linked to greater injury risk late in season (GAA).</td></tr>
      <tr><td>Under-loaded</td><td>&lt; 0.8</td><td>U-shaped risk: low chronic load is itself a risk factor in AFL (Carey; Colby; Rogalski).</td></tr>
      <tr><td>Weekly spike</td><td>&gt; +15% / +50% WoW</td><td>Week-to-week load increments predict injury in elite AFL (Rogalski et al., 2013).</td></tr>
      <tr><td>Monotony</td><td>&gt; 2.0</td><td>Monotonous high-load training linked to illness/overtraining (Foster, 1998).</td></tr>
      <tr><td>Strain</td><td>top 15% of your history</td><td>Strain spikes coincide with illness episodes (Foster).</td></tr>
      <tr><td>HRV suppressed</td><td>&gt;7% below 28-day baseline, esp. 3+ days</td><td>Sustained HRV decline reflects accumulated fatigue / autonomic stress.</td></tr>
      <tr><td>Resting HR up</td><td>≥ baseline + 5 bpm</td><td>Classic marker of fatigue / non-functional overreaching.</td></tr>
      <tr><td>Recovery low</td><td>&lt;34% red, 34–66% amber</td><td>Whoop recovery bands for readiness.</td></tr>
      <tr><td>Sleep</td><td>&lt;7h, or 7-day avg &lt;7h</td><td>Acute &amp; chronic sleep loss impair recovery and raise injury/illness risk.</td></tr>
      <tr><td>Soreness / energy</td><td>≥7 / ≤3 (of 10)</td><td>Subjective wellness flags fatigue early (Saw et al., 2016).</td></tr>
      <tr><td>Overtraining pattern</td><td>recovery red + load red/amber</td><td>Convergent load + autonomic + subjective markers (Meeusen et al. consensus).</td></tr>
    </table>

    <h3>How to read it</h3>
    <p>No single flag means "stop". The value is in <b>convergence</b>: a green ACWR with good HRV, recovery and sleep is a green light to push; a workload spike landing on top of suppressed HRV, poor recovery and high soreness is the pattern that precedes breakdown — that is when the dashboard turns red.</p>

    <h3>References</h3>
    <ul>
      <li>Malone et al. (2017) — Acute:chronic workload ratio &amp; injury in elite Gaelic football. <i>J Sci Med Sport</i>.</li>
      <li>Rogalski, Dawson, Heasman, Gabbett (2013) — Training &amp; game loads and injury risk in elite Australian footballers. <i>J Sci Med Sport</i>.</li>
      <li>Colby et al. / Carey et al. — High-risk loading conditions &amp; ACWR in elite AFL.</li>
      <li>Foster (1998) — Monitoring training with reference to the overtraining syndrome. <i>Med Sci Sports Exerc</i>.</li>
      <li>Gabbett (2016) — The training-injury prevention paradox. <i>Br J Sports Med</i>.</li>
      <li>Saw, Main, Gastin (2016) — Monitoring athletes through self-report. <i>Br J Sports Med</i>.</li>
      <li>Meeusen et al. (2013) — Prevention, diagnosis &amp; treatment of the overtraining syndrome (ECSS/ACSM consensus).</li>
    </ul>
    <p class="muted">Educational decision-support only — not medical advice. Individualise thresholds with your S&amp;C coach / physio.</p>`;
  }

  // ---- Seed (first visit only) --------------------------------------------
  // Pre-populate with the athlete's historical data the very first time this
  // browser opens the app. Never re-seeds once the user has their own data or
  // has explicitly cleared it (guarded by the alt_seeded_v1 flag).
  (function seedIfFirstVisit() {
    if (localStorage.getItem("alt_seeded_v1")) return;
    localStorage.setItem("alt_seeded_v1", "1");
    if (sessions.length === 0 && Array.isArray(window.SEED_SESSIONS) && window.SEED_SESSIONS.length) {
      sessions = window.SEED_SESSIONS.map((s) => ({ id: uid(), updatedAt: nowISO(), ...s }));
      persist();
    }
  })();

  // ---- Init ---------------------------------------------------------------
  $("#f_date").value = LM.dkey(new Date());
  refreshTypeList();
  renderDashboard();
  bindSync();
  // Auto-pull on startup so a device opens to the latest synced data.
  if (syncCfg.auto && syncCfg.token && syncCfg.gistId) {
    setTimeout(() => doSync(), 300);
  }
})();
