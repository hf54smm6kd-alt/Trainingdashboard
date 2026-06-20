/* ============================================================================
 * flags.js — Load-management metrics + literature-based overtraining flags
 * ----------------------------------------------------------------------------
 * Pure functions, no DOM. Loaded before app.js. Exposed via window.LM.
 *
 * Thresholds are drawn from GAA/AFL and team-sport load-monitoring literature.
 * See README.md and the in-app "Flag Guide" for citations.
 * ==========================================================================*/
(function (global) {
  "use strict";

  // ---- Configurable thresholds (single source of truth) -------------------
  const CFG = {
    // Acute:Chronic Workload Ratio (coupled: 7-day acute / 28-day mean weekly)
    acwr: {
      lowMin: 0.80,     // below = undertrained / detraining "U-shape" risk
      sweetMax: 1.30,   // 0.80–1.30 = sweet spot (GREEN)
      cautionMax: 1.50, // 1.30–1.50 = elevated late-season risk (CAUTION)
      // > 1.50 = HIGH ; >= 2.00 = greatest documented injury risk
      severe: 2.00,
    },
    // Week-to-week sRPE load change (previous -> current week)
    weekSpike: { caution: 0.15, high: 0.50 }, // +15% caution, +50% high
    // Foster training monotony / strain
    monotony: { caution: 2.0 },               // >2 = monotonous block
    strainPctile: 0.85,                        // strain in top 15% of history
    // Wellness baselines use a trailing window (days)
    baselineWindow: 28,
    hrvDropPct: 0.07,        // HRV >7% below rolling baseline = suppressed
    rhrRiseBpm: 5,           // resting HR >= baseline +5 bpm = elevated
    recovery: { red: 34, amber: 67 }, // Whoop bands: <34 red, 34–66 amber, >=67 green
    sleep: { acute: 7.0, chronicAvg: 7.0 },   // hrs
    sorenessHigh: 7,         // >=7 / 10
    energyLow: 3,            // <=3 / 10
    strainHighWhoop: 18,     // single-session Whoop strain considered very high
  };

  // ---- Small helpers ------------------------------------------------------
  const num = (v) => (v === "" || v === null || v === undefined || isNaN(v) ? null : +v);
  const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
  const mean = (a) => (a.length ? sum(a) / a.length : null);
  function stdev(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / a.length);
  }
  function firstNonNull(a) { for (const x of a) if (x !== null && x !== undefined && x !== "") return +x; return null; }
  const round = (v, d = 0) => (v === null || v === undefined ? null : +(+v).toFixed(d));

  // Date helpers (local, ignore time-of-day)
  function dkey(d) { const x = new Date(d); return x.toISOString().slice(0, 10); }
  function addDays(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return dkey(d); }
  function weekStart(iso) { // Sunday start, matching the user's sheet
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() - d.getDay());
    return dkey(d);
  }
  function sessionLoad(s) {
    const explicit = num(s.load);
    if (explicit !== null) return explicit;
    const r = num(s.rpe), dur = num(s.duration);
    return r !== null && dur !== null ? r * dur : 0;
  }

  // ---- Aggregate sessions -> per-day records ------------------------------
  // Wellness metrics are once-per-day: take the first non-null reading that day.
  function dailyFromSessions(sessions) {
    const byDay = new Map();
    for (const s of sessions) {
      if (!s.date) continue;
      const k = s.date;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(s);
    }
    const days = [];
    for (const [date, list] of byDay) {
      const pick = (f) => firstNonNull(list.map((s) => num(s[f])));
      days.push({
        date,
        weekStart: weekStart(date),
        load: sum(list.map(sessionLoad)),
        distance: sum(list.map((s) => num(s.totalDistance) || 0)),
        hsr: sum(list.map((s) => num(s.hsr) || 0)),
        sprint: sum(list.map((s) => num(s.sprintDistance) || 0)),
        whoopStrain: pick("whoopStrain"),
        maxSpeed: firstNonNull(list.map((s) => num(s.maxSpeed))),
        hrv: pick("hrv"),
        restingHR: pick("restingHR"),
        sleep: pick("sleep"),
        restorativeSleep: pick("restorativeSleep"),
        recoveryPct: pick("recoveryPct"),
        energy: pick("energy"),
        soreness: pick("soreness"),
        sessions: list.length,
      });
    }
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
    return days;
  }

  // Build a continuous daily series (fills gaps with 0-load rest days) so
  // rolling windows are true calendar windows, not "last N entries".
  function continuousSeries(days) {
    if (!days.length) return [];
    const map = new Map(days.map((d) => [d.date, d]));
    const out = [];
    let cur = days[0].date;
    const end = days[days.length - 1].date;
    let guard = 0;
    while (cur <= end && guard++ < 4000) {
      out.push(map.get(cur) || { date: cur, weekStart: weekStart(cur), load: 0, distance: 0, hsr: 0, sprint: 0, filler: true });
      cur = addDays(cur, 1);
    }
    return out;
  }

  // ---- ACWR (coupled rolling) for each day --------------------------------
  function computeAcwrSeries(series) {
    return series.map((d, i) => {
      const acuteWin = series.slice(Math.max(0, i - 6), i + 1);
      const chronicWin = series.slice(Math.max(0, i - 27), i + 1);
      const acute = sum(acuteWin.map((x) => x.load));
      const chronicDays = chronicWin.length;
      const chronicWeekly = chronicDays > 0 ? (sum(chronicWin.map((x) => x.load)) / chronicDays) * 7 : 0;
      const acwr = chronicWeekly > 0 ? acute / chronicWeekly : null;
      const ready = i >= 27; // need a full 28-day chronic window to trust ACWR
      return { ...d, acute, chronicWeekly, acwr, acwrReady: ready };
    });
  }

  // ---- Weekly aggregation (Sun start) -------------------------------------
  function weeklySummaries(days) {
    const byWeek = new Map();
    for (const d of days) {
      if (!byWeek.has(d.weekStart)) byWeek.set(d.weekStart, []);
      byWeek.get(d.weekStart).push(d);
    }
    const weeks = [];
    const ordered = [...byWeek.keys()].sort();
    ordered.forEach((ws, idx) => {
      const dd = byWeek.get(ws);
      const dailyLoads = dd.map((x) => x.load);
      // monotony needs a 7-day denominator; treat missing days as 0
      const sevenLoads = [];
      for (let i = 0; i < 7; i++) {
        const day = addDays(ws, i);
        const found = dd.find((x) => x.date === day);
        sevenLoads.push(found ? found.load : 0);
      }
      const wkLoad = sum(dailyLoads);
      const sd = stdev(sevenLoads);
      const monotony = sd > 0 ? mean(sevenLoads) / sd : (wkLoad > 0 ? 99 : 0);
      const strain = wkLoad * monotony;
      const prev = idx > 0 ? weeks[idx - 1] : null;
      const wow = prev && prev.load > 0 ? (wkLoad - prev.load) / prev.load : null;

      weeks.push({
        weekStart: ws,
        load: wkLoad,
        distance: sum(dd.map((x) => x.distance)),
        hsr: sum(dd.map((x) => x.hsr)),
        sprint: sum(dd.map((x) => x.sprint)),
        whoopStrain: sum(dd.map((x) => x.whoopStrain || 0)),
        avgHRV: mean(dd.map((x) => x.hrv).filter((v) => v !== null)),
        avgRHR: mean(dd.map((x) => x.restingHR).filter((v) => v !== null)),
        avgSleep: mean(dd.map((x) => x.sleep).filter((v) => v !== null)),
        avgRecovery: mean(dd.map((x) => x.recoveryPct).filter((v) => v !== null)),
        avgSoreness: mean(dd.map((x) => x.soreness).filter((v) => v !== null)),
        avgEnergy: mean(dd.map((x) => x.energy).filter((v) => v !== null)),
        monotony,
        strain,
        wow,
        days: dd.length,
      });
    });

    // Attach end-of-week ACWR (from continuous series) + risk band
    const acwrSeries = computeAcwrSeries(continuousSeries(days));
    const acwrByDate = new Map(acwrSeries.map((x) => [x.date, x]));
    const strains = weeks.map((w) => w.strain).filter((s) => s > 0).sort((a, b) => a - b);
    const strainThresh = strains.length ? strains[Math.floor(strains.length * CFG.strainPctile)] || strains[strains.length - 1] : Infinity;

    weeks.forEach((w) => {
      // ACWR at the last day that has data within the week
      let last = null;
      for (let i = 6; i >= 0; i--) {
        const day = addDays(w.weekStart, i);
        if (acwrByDate.has(day)) { last = acwrByDate.get(day); break; }
      }
      w.acwr = last && last.acwr !== null ? last.acwr : null;
      w.acwrReady = last ? last.acwrReady : false;
      w.risk = weekRisk(w, strainThresh);
    });
    return weeks;
  }

  function weekRisk(w, strainThresh) {
    if (w.acwr === null || !w.acwrReady) return "—";
    const a = w.acwr;
    let level = "GREEN";
    if (a >= CFG.acwr.severe) level = "HIGH";
    else if (a > CFG.acwr.cautionMax) level = "HIGH";
    else if (a > CFG.acwr.sweetMax) level = "CAUTION";
    else if (a < CFG.acwr.lowMin) level = "CAUTION";
    // escalate with monotony / strain
    if (w.monotony > CFG.monotony.caution && w.strain >= strainThresh && level !== "HIGH") level = "CAUTION";
    if (w.monotony > CFG.monotony.caution && (level === "CAUTION")) {
      // monotonous + already elevated => push to HIGH
      if (w.acwr > CFG.acwr.sweetMax) level = "HIGH";
    }
    return level;
  }

  // ---- Flag engine --------------------------------------------------------
  // Evaluates the most recent day with data and returns an array of flags.
  function evaluateFlags(sessions) {
    const days = dailyFromSessions(sessions);
    if (!days.length) return { overall: "green", flags: [], latest: null };

    const series = computeAcwrSeries(continuousSeries(days));
    const realDays = days; // days with real entries
    const latest = series[series.length - 1];
    const latestReal = realDays[realDays.length - 1];
    const weeks = weeklySummaries(days);
    const flags = [];

    const baseDays = (field, win) => {
      const slice = series.slice(Math.max(0, series.length - 1 - win), series.length - 1); // exclude today
      return slice.map((d) => d[field]).filter((v) => v !== null && v !== undefined);
    };

    // 1) ACWR
    if (latest.acwr !== null && latest.acwrReady) {
      const a = latest.acwr;
      if (a >= CFG.acwr.severe) {
        flags.push(F("red", "ACWR ≥ 2.0 — danger zone",
          `Acute:chronic workload ratio is ${a.toFixed(2)}. This is the band with the greatest documented injury risk.`,
          "Elite Gaelic football: ACWR ≥2.0 carried the highest injury odds (Malone et al.)."));
      } else if (a > CFG.acwr.cautionMax) {
        flags.push(F("red", "ACWR > 1.5 — workload spike",
          `ACWR is ${a.toFixed(2)}. Spikes above 1.5 are linked to elevated injury risk, particularly for less-experienced players.`,
          "GAA: ACWR >1.5 spikes increased injury risk (Malone et al., 2017)."));
      } else if (a > CFG.acwr.sweetMax) {
        flags.push(F("amber", "ACWR 1.3–1.5 — elevated",
          `ACWR is ${a.toFixed(2)}. The 1.35–1.50 band raises injury risk late in the season. Hold or taper rather than adding load.`,
          "GAA late-season risk band 1.35–1.50 (Malone et al.)."));
      } else if (a < CFG.acwr.lowMin) {
        flags.push(F("amber", "ACWR < 0.8 — under-loaded",
          `ACWR is ${a.toFixed(2)}. Very low chronic loads are themselves a risk factor (U-shaped relationship) and erode the fitness 'buffer'.`,
          "AFL: low chronic load + low/high ACWR flagged as high-risk (Carey et al.; Colby et al.)."));
      } else {
        flags.push(F("green", "ACWR in the sweet spot",
          `ACWR is ${a.toFixed(2)} (target 0.8–1.3).`,
          "Coupled ACWR 'sweet spot' 0.8–1.3 (Gabbett)."));
      }
    } else {
      flags.push(F("amber", "ACWR not yet reliable",
        `Need ~4 weeks of continuous data to trust the acute:chronic ratio. Keep logging daily.`,
        "Chronic load is a 28-day rolling reference."));
    }

    // 2) Week-on-week spike
    const curWeek = weeks[weeks.length - 1];
    if (curWeek && curWeek.wow !== null) {
      if (curWeek.wow >= CFG.weekSpike.high) {
        flags.push(F("red", "Weekly load jumped >50%",
          `This week's sRPE load is ${(curWeek.wow * 100).toFixed(0)}% above last week.`,
          "AFL: large week-to-week load increments raise injury risk (Rogalski et al., 2013)."));
      } else if (curWeek.wow >= CFG.weekSpike.caution) {
        flags.push(F("amber", "Weekly load rising fast",
          `This week's sRPE load is up ${(curWeek.wow * 100).toFixed(0)}% on last week. Keep week-to-week increases ≲15%.`,
          "Progressive-overload guidance; AFL week-to-week increments (Rogalski et al.)."));
      }
    }

    // 3) Monotony & strain (current week)
    if (curWeek && curWeek.days >= 3 && curWeek.monotony > CFG.monotony.caution) {
      flags.push(F("amber", "High training monotony",
        `Monotony is ${curWeek.monotony.toFixed(2)} (>2). Days look too similar — add genuine easy/hard contrast.`,
        "Foster: monotony >2 with high load is linked to illness/overtraining."));
    }
    {
      const strains = weeks.map((w) => w.strain).filter((s) => s > 0).sort((a, b) => a - b);
      const thr = strains.length ? strains[Math.floor(strains.length * CFG.strainPctile)] : Infinity;
      if (curWeek && curWeek.strain >= thr && curWeek.strain > 0 && strains.length >= 4) {
        flags.push(F("amber", "Training strain elevated",
          `Weekly strain (load × monotony = ${Math.round(curWeek.strain)}) is in the top ${Math.round((1 - CFG.strainPctile) * 100)}% of your history.`,
          "Foster: spikes in strain coincide with illness episodes."));
      }
    }

    // 4) HRV suppression vs rolling baseline
    if (latestReal.hrv !== null) {
      const base = baseDays("hrv", CFG.baselineWindow);
      const bm = mean(base);
      if (bm) {
        const drop = (bm - latestReal.hrv) / bm;
        // consecutive-day suppression check
        const recentHrv = realDays.slice(-4).map((d) => d.hrv).filter((v) => v !== null);
        const consecLow = recentHrv.length >= 3 && recentHrv.slice(-3).every((v) => v < bm * (1 - CFG.hrvDropPct));
        if (consecLow) {
          flags.push(F("red", "HRV suppressed 3+ days",
            `HRV (${latestReal.hrv}) has stayed >7% below your ${CFG.baselineWindow}-day baseline (${Math.round(bm)}) for 3+ days — a parasympathetic-withdrawal pattern.`,
            "Sustained HRV decline tracks accumulated fatigue/overreaching (team-sport HRV reviews)."));
        } else if (drop >= CFG.hrvDropPct) {
          flags.push(F("amber", "HRV below baseline",
            `Today's HRV (${latestReal.hrv}) is ${(drop * 100).toFixed(0)}% below your ${CFG.baselineWindow}-day baseline (${Math.round(bm)}).`,
            "Acute HRV drops reflect autonomic stress; watch the trend."));
        }
      }
    }

    // 5) Resting HR elevation
    if (latestReal.restingHR !== null) {
      const base = baseDays("restingHR", CFG.baselineWindow);
      const bm = mean(base);
      if (bm && latestReal.restingHR >= bm + CFG.rhrRiseBpm) {
        flags.push(F("amber", "Resting HR elevated",
          `Resting HR (${latestReal.restingHR}) is ${(latestReal.restingHR - bm).toFixed(0)} bpm above your baseline (${Math.round(bm)}).`,
          "Elevated resting HR is a classic non-functional-overreaching marker."));
      }
    }

    // 6) Recovery % (Whoop bands)
    if (latestReal.recoveryPct !== null) {
      if (latestReal.recoveryPct < CFG.recovery.red) {
        flags.push(F("red", "Recovery in the red",
          `Recovery is ${latestReal.recoveryPct}% (<34%). Strongly consider a deload / low-strain day.`,
          "Whoop red band <34% indicates poor readiness."));
      } else if (latestReal.recoveryPct < CFG.recovery.amber) {
        flags.push(F("amber", "Recovery moderate",
          `Recovery is ${latestReal.recoveryPct}% (34–66%). Manage intensity today.`,
          "Whoop yellow band 34–66%."));
      }
    }

    // 7) Sleep
    if (latestReal.sleep !== null && latestReal.sleep < CFG.sleep.acute) {
      flags.push(F("amber", "Short sleep last night",
        `${latestReal.sleep} h logged (<7 h). Acute sleep loss blunts recovery and raises perceived effort.`,
        "Sleep <7h impairs recovery/performance in athletes."));
    }
    {
      const last7Sleep = realDays.slice(-7).map((d) => d.sleep).filter((v) => v !== null);
      const avg = mean(last7Sleep);
      if (avg !== null && last7Sleep.length >= 4 && avg < CFG.sleep.chronicAvg) {
        flags.push(F("red", "Chronic sleep debt",
          `7-day average sleep is ${avg.toFixed(1)} h (<7 h). Cumulative debt compounds overtraining risk.`,
          "Chronic short sleep is independently linked to injury/illness."));
      }
    }

    // 8) Subjective wellness
    if (latestReal.soreness !== null && latestReal.soreness >= CFG.sorenessHigh) {
      flags.push(F("amber", "High muscle soreness",
        `Soreness ${latestReal.soreness}/10. Subjective wellness often flags fatigue before objective measures.`,
        "Wellness questionnaires are sensitive to acute load (Saw et al., 2016)."));
    }
    if (latestReal.energy !== null && latestReal.energy <= CFG.energyLow) {
      flags.push(F("amber", "Low energy / mood",
        `Energy ${latestReal.energy}/10. Persistent low energy is an early overreaching sign.`,
        "Mood disturbance is an early NFOR marker (Saw et al., 2016)."));
    }

    // 9) Combined overtraining signal
    const redCount = flags.filter((f) => f.level === "red").length;
    const amberCount = flags.filter((f) => f.level === "amber").length;
    const physRed = flags.some((f) => /HRV|Recovery in the red|Chronic sleep/.test(f.title));
    const loadRed = flags.some((f) => /ACWR|Weekly load|strain/i.test(f.title) && f.level === "red");
    if (physRed && (loadRed || amberCount >= 2)) {
      flags.unshift(F("red", "Overtraining pattern — high load + suppressed recovery",
        "Multiple load and recovery markers are red/amber at once. This is the classic non-functional overreaching signature: prioritise recovery and pull intensity now.",
        "Convergent load + autonomic + subjective markers (Meeusen et al. consensus)."));
    }

    let overall = "green";
    if (flags.some((f) => f.level === "red")) overall = "red";
    else if (flags.some((f) => f.level === "amber")) overall = "amber";

    return { overall, flags, latest, latestReal, weeks, series, days };
  }

  function F(level, title, detail, basis) { return { level, title, detail, basis }; }

  // ---- Public API ---------------------------------------------------------
  global.LM = {
    CFG, sessionLoad, dailyFromSessions, continuousSeries,
    computeAcwrSeries, weeklySummaries, evaluateFlags,
    weekStart, addDays, dkey, mean, round, num,
  };
})(typeof window !== "undefined" ? window : globalThis);
