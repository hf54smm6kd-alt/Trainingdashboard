/* Build seed-data.js from the user's pasted daily-log rows.
 * Rows mirror the spreadsheet column order; null = blank cell.
 * Run: node build-seed.js  (regenerates seed-data.js)
 */
const fs = require("fs");
const n = null;

// Column order: date,type,dur,rpe,load(skip),dist,hsr,sprint,maxSpd,accel,
//               avgHR,maxHR,whoop,hrv,rhr,sleep,restSleep,rec,energy,soreness,notes
const rows = [
["13/04/2026","Level 5 runs",35,6,210,2500,300,150,30,20,119,172,16.1,216,44,7.78,3.45,87,n,n,n],
["13/04/2026","Est Mikko",44,8,352,n,n,n,n,n,145,192,n,n,n,7.28,4.46,n,n,n,n],
["14/04/2026","Run&Bike",60,4,240,4800,n,n,n,n,143,158,15,185,46,7.1,3.36,63,n,n,n],
["14/04/2026","Uppers",120,6,720,n,n,n,n,n,n,n,n,n,n,n,n,n,n,n,n],
["15/04/2026","Rest day",n,n,n,n,n,n,n,n,n,n,5.1,n,43,6.76,2.75,70,n,n,n],
["16/04/2026","Training",70,5,350,5380,386,n,28.6,43,130,184,14.6,181,42,6.5,3,66,7,3,"Hamstring still doms both sides"],
["17/04/2026","Zone 2 run,bike,row",50,5,250,4150,n,n,n,n,137,152,12.6,197,45,6.5,3.33,73,7,5,"Glute doms, slight lower tendon stiffness right hamstring"],
["18/04/2026","Warm up-match",35,4,140,2400,150,n,n,n,125,174,11.4,172,43,9,4.6,55,6,4,"Glute doms"],
["19/04/2026","Tempos",27,6,162,6000,n,n,n,n,145,180,13.8,188,44,7.6,3.26,74,5,3,"Hips a bit tight"],
["19/04/2026","Lowers",50,4,200,n,n,n,n,n,n,n,n,188,43,7.16,3.35,92,6,2,"Slight stiffness right hip"],
["20/04/2026","Rest",n,n,n,n,n,n,n,n,n,n,5,212,43,7.5,4,85,6,1,"Right hip"],
["21/04/2026","Junior match 1/2",45,8,360,6000,250,50,28,n,145,204,15.4,203,43,n,n,n,7,n,n],
["22/04/2026","Uppers",90,6,540,n,n,n,n,n,n,n,n,195,43,7.3,n,n,n,n,n],
["22/04/2026","Zone 2",55,4,220,6000,n,n,n,n,145,154,15,n,n,n,n,n,n,n,n],
["23/04/2026","Training",60,5,300,4200,117,n,25.2,55,128,181,13.4,184,43,9.1,3.26,62,6,n,n],
["23/04/2026","Kicking",25,4,100,1880,n,n,n,n,125,153,n,n,n,n,n,n,n,n,n],
["24/04/2026","Rest",n,n,n,n,n,n,n,n,n,n,n,163,45,8.41,3.66,48,6,n,"Nothing to note"],
["25/04/2026","Match",70,4,280,6000,331,n,29,53,132,187,15.8,172,41,8.3,3.86,59,8,n,"Nothing"],
["26/04/2026","Lowers",80,4,320,n,n,n,n,n,82,108,11.5,172,42,4.5,2.75,47,8,n,"General stiffness"],
["27/04/2026","Zone 2 run and bike",60,4,240,8000,n,n,n,n,140,164,13.6,167,41,7,4.5,64,8,n,n],
["28/04/2026","Training",60,3,180,4400,128,n,27,26,117,164,11.3,171,40,10.21,3,71,7,4,"Doms left hamstring"],
["29/04/2026","Light uppers",60,4,240,n,n,n,n,n,n,n,n,161,43,9.66,3.3,51,8,2,"Left hamstring and hip"],
["30/04/2026","Match",75,8,600,10000,700,n,29.88,62,139,187,17.6,160,43,7,3.5,48,7,2,"Left hamstring and hip"],
["01/05/2026","Rest day",n,n,n,n,n,n,n,n,n,n,5.1,160,39,7.83,3.17,50,n,n,n],
["03/05/2026","11k relay Belfast",50,9,450,11000,n,n,n,n,171,190,18.3,193,40,5.5,2,80,7,n,n],
["04/05/2026","Mobility & shoulders",60,2,120,n,n,n,n,n,n,n,n,158,42,9.83,5,63,5,8,"Doms calves, quads, hip flexors"],
["05/05/2026","Zone 2 bike",30,3,90,n,n,n,n,n,137,148,10.4,139,41,6.833,3.75,50,7,8,"Right foot"],
["06/05/2026","Uppers",70,5,350,n,n,n,n,n,n,n,11,186,40,7.5,4.5,80,6,8,"Right foot"],
["07/05/2026","Training",75,6,450,7427,622,n,28,52,126,205,14.1,190,37,5.5,2.5,74,7,7,"Right foot"],
["08/05/2026","Rest day",n,n,n,n,n,n,n,n,n,n,3.8,181,39,10.3,4.43,78,n,n,n],
["09/05/2026","Match",80,7,560,7200,600,n,n,90,130,186,14.7,175,40,6.6,2.66,61,n,n,n],
["10/05/2026","Rest",n,n,n,n,n,n,n,n,n,n,n,213,38,5.6,2.5,86,8,n,n],
["11/05/2026","Uppers",60,6,360,n,n,n,n,n,n,n,n,n,n,n,n,n,n,n,n],
["11/05/2026","Easy 5k",25,3,75,5000,n,n,n,n,132,143,11.9,194,37,7.5,3.75,75,6,3,"Distal tendon hamstring left"],
["12/05/2026","Training",90,6,540,8660,767,n,31,55,123,180,14.5,186,39,10.5,4,70,6,n,n],
["13/05/2026","Lowers",60,4,240,n,n,n,n,n,n,n,8,195,41,5.6,2.83,73,7,3,"Right foot n joint"],
["14/05/2026",n,n,n,n,n,n,n,n,n,n,n,n,183,40,6.5,2.7,61,7,n,n],
["15/05/2026","Rest day",n,n,n,n,n,n,n,n,n,n,4.8,209,39,6.75,2.75,88,6,n,n],
["16/05/2026","Match",80,8,640,10246,902,n,30.636,66,139,189,17,193,41,9.38,4.66,73,5,n,n],
["17/05/2026","10.5k easy",54,5,270,10500,n,n,n,n,130,146,10.5,179,41,7,3.55,56,n,n,n],
["18/05/2026","Training",35,7,245,3500,782,n,27.5,22,132,184,10.2,171,38,7.5,2.75,52,n,n,n],
["19/05/2026","Rest day",n,n,n,n,n,n,n,n,n,n,n,174,39,7.75,3.66,58,n,n,n],
["20/05/2026","Lowers",n,n,n,n,n,n,n,n,n,n,n,149,41,8,4,42,6,n,n],
["21/05/2026","Easy 5k",25,4,100,5000,n,n,n,n,144,164,17.5,163,42,9.66,4.83,57,n,n,n],
["21/05/2026","Training",80,7,560,7855,706,n,28.4,53,127,194,n,n,n,n,n,n,n,n,n],
["21/05/2026","Uppers",60,6,360,n,n,n,n,n,n,n,n,n,n,n,n,n,n,n,n],
["22/05/2026","Rest day",n,n,n,n,n,n,n,n,n,n,4,148,43,8.83,3.16,50,n,n,n],
["23/05/2026","Match",80,7,560,8298,964,n,32.544,50,n,n,17,144,45,9,4,44,n,n,n],
["24/05/2026","8k run",40,4,160,8000,n,n,n,n,141,152,12.4,141,46,5.33,3,39,n,n,n],
["25/05/2026","Uppers",70,6,420,n,n,n,n,n,n,n,7.1,161,44,5.5,3,58,n,n,n],
["26/05/2026","Easy 5k",25,4,100,5000,n,n,n,n,137,160,n,184,39,5.25,2.166,65,n,n,n],
["26/05/2026","Off feet cardio",28,7,196,n,n,n,n,n,148,176,14.4,n,n,n,n,n,n,n,n],
["27/05/2026","Rest",n,n,n,n,n,n,n,n,n,n,n,170,42,11.1,4,81,n,n,n],
["28/05/2026","Speed",30,3,90,3200,824,n,31.6,17,n,n,14.5,162,41,5.75,3.5,63,6,n,n],
["28/05/2026","4min x3 runs",22,7,154,4200,n,n,n,n,157,181,n,n,n,n,n,n,n,n,n],
["29/05/2025","Lowers",40,5,200,n,n,n,n,n,n,n,5,156,43,6.33,4.16,53,6,n,n],
["30/05/2026","Uppers",40,4,160,n,n,n,n,n,n,n,10,183,43,6.5,3.5,78,6,n,n],
["31/05/2026","Training",60,4,240,4110,263,n,29.52,28,123,175,12.2,180,37,6.3,2.41,76,7,n,n],
["01/06/2026","Match",80,9,720,10500,1215,n,31.57,46,141,208,19.5,156,40,12.18,4.33,56,7,n,n],
["02/06/2026","Rest day",n,n,n,n,n,n,n,n,n,n,5.4,129,45,6,2.5,44,n,n,n],
["03/06/2026","Uppers",90,5,450,n,n,n,n,n,n,n,12.4,143,41,6.83,3.75,45,n,n,n],
["04/06/2026","Training",60,6,360,4693,456,n,29.16,36,127,187,13.6,177,39,5.5,2.33,67,n,n,n],
["05/06/2026","Est session",40,9,360,n,n,n,n,n,152,200,15.8,169,38,6.16,2.5,65,n,n,n],
["06/06/2026","Rest day",n,n,n,n,n,n,n,n,n,n,n,182,42,8,3,76,n,n,n],
["07/06/2026","Rest day",n,n,n,n,n,n,n,n,n,n,5.7,182,39,6.5,3.42,76,n,n,n],
["08/06/2026","Est session",45,7,315,n,n,n,n,n,146,189,14.2,198,40,6.42,3.16,84,n,n,n],
["09/06/2026","Off feet cardio Roche",50,5,250,n,n,n,n,n,126,167,11.2,179,39,9,3,69,n,n,n],
["10/06/2026","Rest day",n,n,n,n,n,n,n,n,n,n,n,168,41,7,2.33,58,n,n,n],
["11/06/2026","Training",30,6,180,3460,547,n,28.1,31,n,n,10.5,172,43,7,3.75,58,n,n,n],
["12/06/2026","Uppers",45,5,225,n,n,n,n,n,n,n,7.7,169,38,7,3.5,61,n,n,n],
["13/06/2026","Hyrox NoBull",45,7,315,4100,n,n,n,n,153,186,16,152,42,7.3,3.75,47,n,n,n],
["14/06/2026","Off feet cardio",28,7,196,n,n,n,n,n,n,n,13.3,151,41,8.75,3.86,52,n,n,n],
["14/06/2026","Lowers",40,4,160,n,n,n,n,n,n,n,n,n,n,n,n,n,n,n,n],
["14/06/2026","Speed",25,4,100,2000,400,n,32,30,n,n,n,n,n,n,n,n,n,n,n],
["08/06/2026","Uppers",50,6,300,n,n,n,n,n,n,n,n,n,n,n,n,n,n,n,n],
["15/06/2026","Rest day",n,n,n,n,n,n,n,n,n,n,9.6,160,40,7.33,3,65,n,n,n],
["16/06/2026","Rehab runs",15,4,60,1352,318,n,27.9,5,n,n,8.1,156,42,8.36,3.58,61,n,n,n],
["17/06/2026","Uppers",60,5,300,n,n,n,n,n,n,n,15.7,176,40,8.61,4.83,94,n,n,n],
["18/06/2026","Match warmup",30,4,120,1500,150,n,n,n,n,n,7,180,39,9.28,4.25,97,n,n,n],
["19/06/2026","Hyrox ceda benchmark",24,8,192,2600,n,n,n,n,n,n,12.4,177,42,6.5,3,86,n,n,n],
["17/06/2026","Off feet zone 2",45,5,225,n,n,n,n,n,n,n,n,n,n,n,n,n,n,n,n],
];

const FIELDS = ["date","sessionType","duration","rpe","load","totalDistance","hsr",
  "sprintDistance","maxSpeed","accelerations","avgHR","maxHR","whoopStrain","hrv",
  "restingHR","sleep","restorativeSleep","recoveryPct","energy","soreness","notes"];

function isoDate(s) {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
}

const out = [];
for (const r of rows) {
  const rec = {};
  FIELDS.forEach((f, i) => {
    if (f === "load") return;              // derived from rpe × duration
    let v = r[i];
    if (v === n || v === undefined || v === "") return;
    rec[f] = f === "date" ? isoDate(v) : v;
  });
  // need a date plus at least one other field
  if (rec.date && Object.keys(rec).length > 1) out.push(rec);
}

const banner = "/* seed-data.js — auto-generated from the athlete's spreadsheet (build-seed.js).\n" +
  " * Loaded on first visit only; never overrides user edits. */\n";
fs.writeFileSync("seed-data.js",
  banner + "window.SEED_SESSIONS = " + JSON.stringify(out, null, 0) + ";\n");
console.log("Wrote seed-data.js with", out.length, "sessions");
