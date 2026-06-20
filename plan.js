/* ============================================================================
 * plan.js — Periodised plan, pace zones, tests/goals & rules-engine extras
 * for the Half-Marathon + GAA concurrent-training build.
 * Pure functions + settings/tests persistence. No DOM. Exposed via window.PLAN.
 * Depends on flags.js (window.LM) for date helpers + daily/weekly aggregation.
 * ==========================================================================*/
(function (global) {
  "use strict";
  const LM = global.LM;

  const SETTINGS_KEY = "alt_settings_v1";
  const TESTS_KEY = "alt_tests_v1";

  // ---- Settings -------------------------------------------------------------
  const DEFAULT_SETTINGS = {
    raceDate: "2027-01-24",
    seasonEndDate: "2026-10-12",
    maxVelocityMs: 9.5,
    ewmaMode: false,
  };
  function loadSettings() {
    try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); }
    catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  }
  function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

  // ---- Tests (5k/10k/parkrun) -----------------------------------------------
  const TEST_DIST_KM = { "5k": 5, "10k": 10, parkrun: 5 };
  function loadTests() {
    try { return JSON.parse(localStorage.getItem(TESTS_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveTests(t) { localStorage.setItem(TESTS_KEY, JSON.stringify(t)); }
  function defaultSeedTest() {
    return [{ id: "seed10k", date: "2026-04-01", type: "10k", result: "39:30", valueSec: 2370 }];
  }
  function latestTest(tests) {
    if (!tests || !tests.length) return null;
    return [...tests].sort((a, b) => (a.date < b.date ? -1 : 1))[tests.length - 1] || [...tests].sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
  }

  // ---- Time / pace helpers ---------------------------------------------------
  function parseTime(str) {
    if (!str) return null;
    const parts = String(str).split(":").map((x) => +x);
    if (parts.some((x) => isNaN(x))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }
  const pad2 = (n) => String(Math.max(0, Math.round(n))).padStart(2, "0");
  function fmtTime(sec) {
    if (sec === null || sec === undefined || isNaN(sec)) return "—";
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  }
  const fmtPace = fmtTime; // sec/km -> "m:ss"

  // T2 = T1 * (D2/D1)^1.06 — Riegel
  function riegelTime(t1, d1, d2) { return t1 * Math.pow(d2 / d1, 1.06); }

  // ---- Pace zones (Section 4) — recomputed from the latest test -------------
  // Offsets (sec/km) relative to a 10k-equivalent pace, calibrated against the
  // seed 39:30 10k -> zone table in the brief.
  const ZONE_OFFSETS = {
    recovery: [83, 108], easy: [63, 83], long: [53, 78], steady: [28, 43],
    threshold: [8, 18], cruise: [3, 13], vo2max: [-22, -12],
  };
  function computeZones(testSec, testDistKm) {
    if (!testSec || !testDistKm) return null;
    const t10k = riegelTime(testSec, testDistKm, 10);
    const pace10k = t10k / 10;
    const tHm = riegelTime(testSec, testDistKm, 21.0975);
    const paceHm = tHm / 21.0975;
    const zones = {};
    Object.keys(ZONE_OFFSETS).forEach((k) => {
      const [lo, hi] = ZONE_OFFSETS[k];
      zones[k] = [pace10k + lo, pace10k + hi];
    });
    zones.pace10k = pace10k;
    zones.predictedHmSec = tHm;
    zones.predictedHmPace = paceHm;
    zones.goalA = paceHm * 0.927;
    zones.goalB = paceHm * 0.965;
    zones.goalC = paceHm;
    return zones;
  }
  function decisionGate(testSec, testDistKm) {
    const t10k = riegelTime(testSec, testDistKm, 10);
    if (t10k <= 37 * 60 + 15) return { goal: "A", label: "10k ≈37:00 or faster — chase the A goal (1:21)" };
    if (t10k <= 38 * 60 + 15) return { goal: "B", label: "10k ≈38:00 — target the B goal (1:24)" };
    return { goal: "C", label: "Race smart for the floor — C goal / sub-1:27" };
  }

  // ---- Phases (Section 5.1 / 5.8) --------------------------------------------
  const PHASE_META = {
    in_season: { label: "In-season (GAA priority)", weeklyKm: [10, 25], longRun: "≤12", maxV: 2, strength: 2, qualityRuns: 0 },
    bridge: { label: "Bridge", weeklyKm: [28, 32], longRun: "12–14", maxV: 1, strength: 2, qualityRuns: 1 },
    base: { label: "Base build", weeklyKm: [30, 45], longRun: "14–16", maxV: 1, strength: 2, qualityRuns: 1 },
    specific: { label: "HM-specific", weeklyKm: [45, 56], longRun: "16–20", maxV: 1, strength: 2, qualityRuns: 2 },
    peak: { label: "Peak / sharpen", weeklyKm: [52, 58], longRun: "20–22", maxV: 1, strength: 1, qualityRuns: 2 },
    taper: { label: "Taper & race", weeklyKm: [18, 30], longRun: "≤14", maxV: 1, strength: 0, qualityRuns: 1 },
    done: { label: "Race complete", weeklyKm: [0, 0], longRun: "—", maxV: 0, strength: 0, qualityRuns: 0 },
  };
  function daysBetween(a, b) { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000); }
  function computePhase(dateISO, raceDate, seasonEndDate) {
    if (dateISO > raceDate) return { phase: "done", weeksToRace: 0 };
    const weeksToRace = Math.floor(daysBetween(dateISO, raceDate) / 7);
    if (dateISO <= seasonEndDate) return { phase: "in_season", weeksToRace };
    if (weeksToRace > 16) return { phase: "bridge", weeksToRace };
    if (weeksToRace <= 2) return { phase: "taper", weeksToRace };
    if (weeksToRace <= 6) return { phase: "peak", weeksToRace };
    if (weeksToRace <= 12) return { phase: "specific", weeksToRace };
    return { phase: "base", weeksToRace };
  }

  // ---- Weekly templates (Sections 5.2–5.7) -----------------------------------
  // dow: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  const WEEKLY_TEMPLATES = {
    in_season: [
      { dow: 1, kind: "run", title: "Easy run", details: "30–40 min, conversational + mobility", zone: "easy", intensity: "easy" },
      { dow: 2, kind: "match", title: "GAA pitch", details: "Speed / HSR / COD dose from training", intensity: "hard" },
      { dow: 2, kind: "strength", title: "Lower strength", details: "Heavy bilateral squat/trap-bar + RDL + calf, after pitch or same evening", intensity: "moderate" },
      { dow: 3, kind: "run", title: "Easy run or rest", details: "25–35 min, or full rest — auto-regulate off recovery", zone: "easy", intensity: "easy" },
      { dow: 4, kind: "match", title: "GAA pitch", details: "Speed / HSR / COD dose from training", intensity: "hard" },
      { dow: 4, kind: "strength", title: "Upper strength", intensity: "moderate" },
      { dow: 5, kind: "run", title: "Rest / mobility", details: "Optional 20 min easy shake-out", zone: "recovery", intensity: "easy" },
      { dow: 6, kind: "match", title: "Match day", intensity: "hard" },
      { dow: 0, kind: "run", title: "Recovery jog or long run", details: "20–30 min recovery jog or rest; if no Saturday match, easy long run 8–12 km", zone: "long", intensity: "easy" },
    ],
    bridge: [
      { dow: 1, kind: "run", title: "Easy run", details: "35 min", zone: "easy", intensity: "easy" },
      { dow: 2, kind: "run", title: "Light threshold", details: "WU + 3×5 min @threshold + CD", zone: "threshold", intensity: "hard" },
      { dow: 2, kind: "strength", title: "Lower strength", intensity: "moderate" },
      { dow: 3, kind: "run", title: "Easy + plyos", details: "40 min easy + plyos Tier 1", zone: "easy", intensity: "easy" },
      { dow: 3, kind: "plyo", title: "Plyos (Tier 1)", plyoContacts: 30, intensity: "neural" },
      { dow: 4, kind: "sprint", title: "Max-V flying sprints", details: "5–6×30–40 m fly @95%, full recovery — keeps speed exposure non-zero", sprintEfforts: 6, sprintFlyM: 200, intensity: "neural" },
      { dow: 4, kind: "strength", title: "Upper strength", intensity: "moderate" },
      { dow: 5, kind: "run", title: "Easy run", details: "30 min", zone: "easy", intensity: "easy" },
      { dow: 6, kind: "run", title: "Steady run", details: "40 min", zone: "steady", intensity: "moderate" },
      { dow: 0, kind: "run", title: "Long run", details: "12–14 km", zone: "long", intensity: "easy" },
    ],
    base: [
      { dow: 1, kind: "run", title: "Rest or recovery", details: "30 min easy, or rest", zone: "recovery", intensity: "easy" },
      { dow: 2, kind: "run", title: "Threshold", details: "WU + 4×6 min @threshold (90s jog) + CD (~8 km)", zone: "threshold", intensity: "hard" },
      { dow: 2, kind: "strength", title: "Lower strength (heavy)", details: "Squat/trap-bar + RDL + calf", intensity: "hard" },
      { dow: 3, kind: "run", title: "Easy + plyos", details: "45 min easy", zone: "easy", intensity: "easy" },
      { dow: 3, kind: "plyo", title: "Plyos (low)", plyoContacts: 35, intensity: "neural" },
      { dow: 4, kind: "sprint", title: "Max-V sprints", details: "6×30–40 m flying @95%, full recovery + 20 min easy", sprintEfforts: 6, sprintFlyM: 240, intensity: "neural" },
      { dow: 4, kind: "strength", title: "Upper strength", intensity: "moderate" },
      { dow: 5, kind: "run", title: "Easy run or rest", details: "35 min", zone: "easy", intensity: "easy" },
      { dow: 6, kind: "run", title: "Steady run", details: "50–55 min, finish steady", zone: "steady", intensity: "moderate" },
      { dow: 0, kind: "run", title: "Long run", details: "14–16 km", zone: "long", intensity: "easy" },
    ],
    specific: [
      { dow: 1, kind: "run", title: "Recovery or rest", details: "35 min", zone: "recovery", intensity: "easy" },
      { dow: 2, kind: "run", title: "Threshold", details: "WU + 5×6 min @threshold (75s jog) or 2×15 min cruise + CD (~10 km)", zone: "threshold", intensity: "hard" },
      { dow: 2, kind: "strength", title: "Lower strength (light/maintenance)", intensity: "moderate" },
      { dow: 3, kind: "run", title: "Easy + plyos", details: "50 min easy", zone: "easy", intensity: "easy" },
      { dow: 3, kind: "plyo", title: "Plyos", plyoContacts: 40, intensity: "neural" },
      { dow: 4, kind: "sprint", title: "Max-V sprints", details: "6–8×40–50 m flying @95% + 25 min easy", sprintEfforts: 7, sprintFlyM: 300, intensity: "neural" },
      { dow: 4, kind: "strength", title: "Upper strength (light/maintenance)", intensity: "moderate" },
      { dow: 5, kind: "run", title: "Easy run", details: "40 min", zone: "easy", intensity: "easy" },
      { dow: 6, kind: "run", title: "Race-pace block", details: "WU + 5–6 km @goal HM pace within an 8–10 km run", zone: "race_pace", intensity: "hard" },
      { dow: 0, kind: "run", title: "Long run", details: "18–20 km — some weeks fast-finish last 4–5 km @goal pace", zone: "long", intensity: "easy" },
    ],
    peak: [
      { dow: 1, kind: "run", title: "Recovery or rest", details: "30 min", zone: "recovery", intensity: "easy" },
      { dow: 2, kind: "run", title: "VO2max touch", details: "WU + 5×3 min @VO2max (3 min jog) + CD", zone: "vo2max", intensity: "hard" },
      { dow: 2, kind: "strength", title: "Lower strength (light)", intensity: "moderate" },
      { dow: 3, kind: "run", title: "Easy + plyos", details: "45 min easy", zone: "easy", intensity: "easy" },
      { dow: 3, kind: "plyo", title: "Plyos", plyoContacts: 35, intensity: "neural" },
      { dow: 4, kind: "sprint", title: "Max-V sprints", details: "6–8×40–50 m flying @95% + 20 min easy", sprintEfforts: 7, sprintFlyM: 300, intensity: "neural" },
      { dow: 5, kind: "run", title: "Easy run", details: "35 min", zone: "easy", intensity: "easy" },
      { dow: 6, kind: "run", title: "Race-pace block", details: "WU + 6 km @goal HM pace within 9–10 km", zone: "race_pace", intensity: "hard" },
      { dow: 0, kind: "run", title: "Long run, fast-finish", details: "20–22 km, last 4–5 km @goal pace", zone: "long", intensity: "easy" },
    ],
    taper: [
      { dow: 1, kind: "run", title: "Easy + strides", details: "25–30 min easy + 4×20s strides", zone: "easy", intensity: "easy" },
      { dow: 2, kind: "run", title: "Short tempo", details: "3×5 min @threshold", zone: "threshold", intensity: "moderate" },
      { dow: 3, kind: "run", title: "Easy run", details: "25–30 min", zone: "easy", intensity: "easy" },
      { dow: 4, kind: "sprint", title: "Light flying sprints", details: "3 light flying efforts @95% — stay switched on, no fatigue", sprintEfforts: 3, sprintFlyM: 120, intensity: "neural" },
      { dow: 5, kind: "run", title: "Easy + strides", details: "20 min + strides", zone: "easy", intensity: "easy" },
      { dow: 6, kind: "run", title: "Pre-race shake-out", details: "15–20 min easy", zone: "recovery", intensity: "easy" },
      { dow: 0, kind: "race", title: "RACE DAY", details: "Half marathon — start at your tested goal pace, controlled negative split.", zone: "race_pace", intensity: "hard" },
    ],
    done: [],
  };
  function templateFor(phase) { return WEEKLY_TEMPLATES[phase] || []; }
  function generateDay(dateISO, settings) {
    const ph = computePhase(dateISO, settings.raceDate, settings.seasonEndDate);
    const dow = new Date(dateISO + "T00:00:00").getDay();
    const sessions = templateFor(ph.phase).filter((t) => t.dow === dow);
    return Object.assign({ date: dateISO, sessions }, ph);
  }
  function generateWeek(weekStartISO, settings) {
    const out = [];
    for (let i = 0; i < 7; i++) out.push(generateDay(LM.addDays(weekStartISO, i), settings));
    return out;
  }

  // ---- Readiness / auto-regulation (Section 6.2) -----------------------------
  function readinessLight(recoveryPct) {
    if (recoveryPct === null || recoveryPct === undefined || isNaN(recoveryPct)) return null;
    if (recoveryPct >= 67) return "green";
    if (recoveryPct >= 34) return "yellow";
    return "red";
  }
  const READINESS_ACTION = {
    green: "Proceed as planned — green light for hard sessions and max-velocity work.",
    yellow: "Keep the session but trim volume ~20–30%, or downgrade quality → steady. Skip max-V and heavy plyos today.",
    red: "Easy or rest only. Never sprint, never run threshold, never lift heavy today.",
  };

  // ---- Generic ACWR (rolling or EWMA) for any daily field --------------------
  // Generalises LM.computeAcwrSeries (sRPE-load, rolling-only) to any field
  // (e.g. distance, hsr, sprint) with an EWMA option (Section 6.1).
  function acwrSeriesFor(days, field, mode) {
    const series = LM.continuousSeries(days);
    if (mode === "ewma") {
      const lA = 2 / (7 + 1), lC = 2 / (28 + 1);
      let ea = null, ec = null;
      return series.map((d, i) => {
        const v = d[field] || 0;
        ea = ea === null ? v : v * lA + ea * (1 - lA);
        ec = ec === null ? v : v * lC + ec * (1 - lC);
        const acute = ea * 7, chronicWeekly = ec * 7;
        const acwr = chronicWeekly > 0 ? acute / chronicWeekly : null;
        return Object.assign({}, d, { acute, chronicWeekly, acwr, acwrReady: i >= 27 });
      });
    }
    return series.map((d, i) => {
      const acuteWin = series.slice(Math.max(0, i - 6), i + 1);
      const chronicWin = series.slice(Math.max(0, i - 27), i + 1);
      const acute = acuteWin.reduce((s, x) => s + (x[field] || 0), 0);
      const chronicWeekly = chronicWin.length ? (chronicWin.reduce((s, x) => s + (x[field] || 0), 0) / chronicWin.length) * 7 : 0;
      const acwr = chronicWeekly > 0 ? acute / chronicWeekly : null;
      return Object.assign({}, d, { acute, chronicWeekly, acwr, acwrReady: i >= 27 });
    });
  }
  function acwrBand(a) {
    if (a === null || a === undefined) return "";
    if (a >= 2.0 || a > 1.5) return "red";
    if (a > 1.3 || a < 0.8) return "amber";
    return "green";
  }

  // ---- 80/20 intensity classification (Section 6.4) --------------------------
  const HARD_ZONES = new Set(["threshold", "cruise", "vo2max", "race_pace"]);
  function classifySession(s) {
    if (!s || s.kind && s.kind !== "run") return null; // only runs count toward 80/20
    if (s.runType && HARD_ZONES.has(s.runType)) return "hard";
    if (s.runType) return "easy";
    const t = (s.sessionType || "").toLowerCase();
    if (/threshold|tempo|cruise|vo2|interval|race.?pace|sprint/.test(t)) return "hard";
    const rpe = LM.num(s.rpe);
    if (rpe !== null && rpe >= 7) return "hard";
    if (s.totalDistance || s.duration) return "easy";
    return null;
  }
  function intensitySplit(sessions) {
    let easyKm = 0, hardCount = 0, easyCount = 0;
    sessions.forEach((s) => {
      const c = classifySession(s);
      if (!c) return;
      const km = (LM.num(s.totalDistance) || 0) / 1000;
      if (c === "easy") { easyCount++; easyKm += km; } else hardCount++;
    });
    const total = easyCount + hardCount;
    return { easyKm, easyCount, hardCount, hardPct: total ? hardCount / total : null };
  }

  // ---- Sprint-dose guardrails (Section 6.3 / 3.5) -----------------------------
  function sprintGuardrails(weeks) {
    const warnings = [];
    weeks.forEach((w, i) => {
      const efforts = w.maxVEfforts || 0;
      if (i > 0) {
        const prev = weeks[i - 1].sprint || 0;
        if (prev > 0 && w.sprint > 0 && (w.sprint - prev) / prev > 0.5) {
          warnings.push({ weekStart: w.weekStart, level: "red", text: `Sprint distance jumped ${Math.round(((w.sprint - prev) / prev) * 100)}% week-on-week — smooth the curve.` });
        }
      }
      if (efforts > 0 && (efforts < 4 || efforts > 12)) {
        warnings.push({ weekStart: w.weekStart, level: "amber", text: efforts > 12 ? `${efforts} max-V efforts this week — moderate band (≈4–12) is the safest dose; very high weekly counts have reduced eccentric hamstring strength acutely.` : `Only ${efforts} max-V efforts — very-low exposure also carries elevated hamstring-injury risk; aim for a moderate weekly dose.` });
      }
    });
    return warnings;
  }

  global.PLAN = {
    loadSettings, saveSettings, loadTests, saveTests, defaultSeedTest, latestTest, TEST_DIST_KM,
    parseTime, fmtTime, fmtPace, riegelTime, computeZones, decisionGate,
    PHASE_META, computePhase, WEEKLY_TEMPLATES, templateFor, generateDay, generateWeek,
    readinessLight, READINESS_ACTION, acwrSeriesFor, acwrBand,
    classifySession, intensitySplit, sprintGuardrails,
  };
})(typeof window !== "undefined" ? window : globalThis);
