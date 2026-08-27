"use client";

// Kairos — "eclipse v1" signature, transplanted verbatim from the approved
// akribeia_kairos_eclipse_v1.html. Seeds, timings, palette, phase machine,
// the traced 2011–2026 backtest trajectory, easing and text calls are the
// author's. Mechanical adaptations only: canvas via ref, rAF handle captured
// and cancelled on unmount, REDUCED read inside the effect (reduced motion
// draws exactly one static frame), setTransform reset before the authored
// ctx.scale, minimal TypeScript typing (fleck/trail interfaces; the chosen
// flecks' px/py/pT get behavior-neutral zero initializers — they are always
// assigned before first read), and one dead unused-gradient line dropped.

import { SignatureCard, type SignatureStats } from "./signature-card";

interface Fleck {
  s: number;
  x: number;
  v: number;
  r: number;
  chosen: boolean;
  state?: string;
}
interface ChosenFleck extends Fleck {
  capAt: number;
  orb: number;
  state: string;
  cx: number;
  cy: number;
  px: number;
  py: number;
  pT: number;
}

function setup(cv: HTMLCanvasElement): () => void {
  const REDUCED =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const context = cv.getContext("2d");
  if (!context) return () => {};
  const ctx: CanvasRenderingContext2D = context;
  const W = 1100,
    H = 430,
    DPR = 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(DPR, DPR);

  const KV = "#B44FD8",
    KV_HI = "#E9A8FF",
    PALE = "#F4E9FB";
  function mulberry32(a: number) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20260816);
  function mono(
    s: string,
    x: number,
    y: number,
    col: string,
    size: number,
    weight?: number,
    align?: CanvasTextAlign,
  ) {
    ctx.fillStyle = col;
    ctx.textAlign = align || "left";
    ctx.font = `${weight || 400} ${size}px "IBM Plex Mono",monospace`;
    ctx.fillText(s, x, y);
  }
  const sm = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));

  /* one full cycle */
  const LOOP = 24000;
  const T_TOT = 4400,
    T_FLASH = 4400,
    T_COLL0 = 5300,
    T_ROLL0 = 8600,
    T_ROLL1 = 23200;

  /* the eclipse site */
  const EX = 280,
    EY = 225,
    SUNR = 38;

  /* the trajectory: TRACED from the actual Kairos backtest chart (2011–2026, $1 → $112, 38 rebalances) */
  const trajX = (u: number) => 300 + 715 * u;
  const HT = [
    0.0, 0.0074, 0.026, 0.0353, 0.0297, 0.0315, 0.0297, 0.0148, 0.0111, 0.0427, 0.0482, 0.0631,
    0.0742, 0.0853, 0.0649, 0.0686, 0.0872, 0.102, 0.0928, 0.0909, 0.0853, 0.102, 0.1224, 0.1373,
    0.1466, 0.1484, 0.1484, 0.1391, 0.1373, 0.1503, 0.1725, 0.1818, 0.1985, 0.1929, 0.2059, 0.2301,
    0.2523, 0.2597, 0.2635, 0.2635, 0.2764, 0.2727, 0.2709, 0.2746, 0.2635, 0.2616, 0.2839, 0.3043,
    0.3265, 0.3451, 0.3562, 0.3488, 0.334, 0.3358, 0.3377, 0.3432, 0.321, 0.3265, 0.3488, 0.3599,
    0.3636, 0.3748, 0.3785, 0.3785, 0.3785, 0.3803, 0.3933, 0.3933, 0.41, 0.4249, 0.423, 0.4304,
    0.4304, 0.4267, 0.4397, 0.4583, 0.4731, 0.4638, 0.462, 0.475, 0.4638, 0.4601, 0.4787, 0.4898,
    0.4972, 0.5232, 0.5343, 0.5158, 0.5083, 0.4824, 0.5028, 0.5009, 0.4972, 0.4991, 0.4954, 0.5065,
    0.5065, 0.5009, 0.4972, 0.4991, 0.4991, 0.5009, 0.4879, 0.462, 0.4768, 0.5009, 0.5232, 0.538,
    0.5566, 0.5696, 0.6104, 0.6475, 0.6642, 0.6939, 0.7199, 0.731, 0.7403, 0.7365, 0.757, 0.7774,
    0.7922, 0.8071, 0.8145, 0.8126, 0.7922, 0.7848, 0.7885, 0.7922, 0.7885, 0.8089, 0.8275, 0.8256,
    0.8479, 0.859, 0.8609, 0.885, 0.8905, 0.8942, 0.8942, 0.9184, 0.9481, 0.9536, 0.9536, 0.9703,
    0.9759, 0.9703, 0.976, 0.984, 0.994, 1.0,
  ];
  function hAt(u: number) {
    const f = Math.max(0, Math.min(1, u)) * (HT.length - 1),
      i = Math.floor(f),
      q = f - i;
    return HT[i] * (1 - q) + HT[Math.min(i + 1, HT.length - 1)] * q;
  }
  const trajY = (u: number) => 243 - hAt(u) * 158;

  /* streams: three event rivers below */
  const STREAMS = [
    { name: "EARNINGS", y: 318, col: "#C9A0DC" },
    { name: "FILINGS", y: 352, col: "#8FA8D0" },
    { name: "INSIDER", y: 386, col: "#9CCBB0" },
  ];
  const flecks: Fleck[] = [];
  for (let i = 0; i < 66; i++) {
    const s = Math.floor(rand() * 3);
    flecks.push({ s, x: rand() * W, v: 0.014 + rand() * 0.02, r: 1 + rand() * 1.2, chosen: false });
  }
  /* the five that will be collected: 2 earnings, 2 filings, 1 insider */
  const chosen: ChosenFleck[] = [];
  (
    [
      [0, 0],
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 4],
    ] as [number, number][]
  ).forEach(([si], i) => {
    const f: ChosenFleck = {
      s: si,
      x: 520 + i * 70 + rand() * 30,
      v: 0.012 + rand() * 0.008,
      r: 1.6,
      chosen: true,
      capAt: T_COLL0 + i * 640,
      orb: i * ((Math.PI * 2) / 5),
      state: "stream",
      cx: 0,
      cy: 0,
      px: 0,
      py: 0,
      pT: 0,
    };
    flecks.push(f);
    chosen.push(f);
  });

  /* stars */
  const stars = [...Array(70)].map(() => ({
    x: rand() * W,
    y: rand() * (H - 160),
    r: 0.7 + rand() * 1.1,
    a: 0.2 + rand() * 0.5,
    ph: rand() * 7,
  }));

  const trail: { x: number; y: number; t: number }[] = [];
  const T0 = performance.now();

  function vortex(cx: number, cy: number, rot: number, scale: number, alpha: number) {
    /* three logarithmic arms */
    for (let a = 0; a < 3; a++) {
      ctx.beginPath();
      for (let k = 0; k <= 44; k++) {
        const th = (k / 44) * 3.1 * Math.PI;
        const r = (3.4 + th * 3.1) * scale;
        const x = cx + r * Math.cos(th + rot + a * 2.094);
        const y = cy + r * Math.sin(th + rot + a * 2.094) * 0.86;
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.save();
      ctx.shadowColor = KV;
      ctx.shadowBlur = 8 * alpha;
      ctx.strokeStyle = "rgba(201,143,220," + 0.55 * alpha + ")";
      ctx.lineWidth = 2.1 * scale;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26 * scale);
    core.addColorStop(0, "rgba(244,233,251," + 0.9 * alpha + ")");
    core.addColorStop(0.35, "rgba(180,79,216," + 0.5 * alpha + ")");
    core.addColorStop(1, "rgba(180,79,216,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, 26 * scale, 0, 7);
    ctx.fill();
  }

  let raf = 0;
  function draw(now: number) {
    const T = (now - T0) % LOOP,
      t = now - T0;
    ctx.clearRect(0, 0, W, H);

    /* sky */
    stars.forEach((s) => {
      ctx.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(t * 0.001 + s.ph));
      ctx.fillStyle = "#8FA0BC";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 7);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    /* phases */
    const uApp = Math.min(1, T / T_TOT); // moon approach
    const totality = sm(1 - Math.abs(T - T_TOT - 350) / 900); // darkness + corona peak
    const uColl = (T - T_COLL0) / (T_ROLL0 - T_COLL0);
    const uRoll = Math.max(0, Math.min(1, (T - T_ROLL0) / (T_ROLL1 - T_ROLL0)));
    const rolling = T >= T_ROLL0 && T < T_ROLL1;
    const arriving = T >= T_ROLL1;

    /* vortex center through the phases */
    let vx = EX,
      vy = EY,
      vScale = 0,
      vAlpha = 0;
    if (T >= T_COLL0 && T < T_ROLL0) {
      const q = sm(Math.min(1, uColl));
      vScale = 0.6 + 0.6 * q;
      vAlpha = 0.35 + 0.65 * q;
      vy = EY + 18 * q;
    } else if (rolling) {
      vScale = 1.22;
      vAlpha = 1;
      vx = trajX(uRoll);
      vy = trajY(uRoll);
    } else if (arriving) {
      vScale = 1.22;
      vAlpha = Math.max(0, 1 - (T - T_ROLL1) / 700);
      vx = trajX(1);
      vy = trajY(1);
    }

    /* streams flow always */
    STREAMS.forEach((st) => {
      ctx.strokeStyle = "rgba(110,125,150,0.10)";
      ctx.beginPath();
      ctx.moveTo(0, st.y);
      ctx.lineTo(W, st.y);
      ctx.stroke();
      mono(st.name, 10, st.y - 6, "#3E4C64", 6.5, 500);
    });
    flecks.forEach((f) => {
      if (f.chosen && f.state !== "stream") return;
      f.x += f.v * 16;
      if (f.x > W + 10) f.x = -10;
      const st = STREAMS[f.s];
      const y = st.y + Math.sin(f.x * 0.02 + f.s) * 4;
      ctx.globalAlpha = f.chosen ? 0.95 : 0.5;
      if (f.chosen) {
        ctx.save();
        ctx.shadowColor = PALE;
        ctx.shadowBlur = 6;
      }
      ctx.fillStyle = f.chosen ? PALE : st.col;
      ctx.beginPath();
      ctx.arc(f.x, y, f.r, 0, 7);
      ctx.fill();
      if (f.chosen) ctx.restore();
      ctx.globalAlpha = 1;
    });

    /* collection: the chosen five spiral into the vortex */
    chosen.forEach((f, i) => {
      if (T < f.capAt && T < T_ROLL0) {
        f.state = "stream";
        return;
      }
      if (f.state === "stream" && T >= f.capAt) {
        f.state = "pulling";
        f.px = f.x;
        f.py = STREAMS[f.s].y;
        f.pT = T;
      }
      if (T < T_COLL0) {
        f.state = "stream";
        return;
      } // loop reset
      if (f.state === "pulling") {
        const q = sm(Math.min(1, (T - f.pT) / 700));
        const tx = vx + 23 * Math.cos(f.orb),
          ty = vy + 23 * Math.sin(f.orb) * 0.86;
        f.cx = f.px + (tx - f.px) * q + Math.sin(q * 9) * 8 * (1 - q);
        f.cy = f.py + (ty - f.py) * q;
        if (q >= 1) f.state = "orbit";
      }
      if (f.state === "orbit") {
        const th = t * 0.0036 + f.orb;
        const R = 23 + 3 * Math.sin(t * 0.002 + i);
        f.cx = vx + R * Math.cos(th);
        f.cy = vy + R * Math.sin(th) * 0.86;
      }
      if (f.state !== "stream" && vAlpha > 0.05) {
        ctx.save();
        ctx.shadowColor = PALE;
        ctx.shadowBlur = 9;
        ctx.fillStyle = PALE;
        ctx.beginPath();
        ctx.arc(f.cx, f.cy, 3.2, 0, 7);
        ctx.fill();
        ctx.restore();
      }
    });

    /* trajectory ghost + trail */
    if (T > T_ROLL0 - 800) {
      ctx.setLineDash([2, 7]);
      ctx.strokeStyle = "rgba(148,160,180,0.18)";
      ctx.beginPath();
      for (let k = 0; k <= 60; k++) {
        const u = k / 60;
        const x = trajX(u),
          y = trajY(u);
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (rolling) {
      trail.push({ x: vx, y: vy, t });
      while (trail.length && t - trail[0].t > 3800) trail.shift();
      ctx.beginPath();
      trail.forEach((p, k) => {
        if (k) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      });
      ctx.save();
      ctx.shadowColor = KV;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = "rgba(180,79,216,0.4)";
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();
    } else if (!arriving) trail.length = 0;

    /* the vortex itself */
    if (vAlpha > 0) vortex(vx, vy, t * 0.0042, vScale, vAlpha);

    /* the eclipse (before and through totality) */
    if (T < T_COLL0 + 900) {
      const fade = T < T_COLL0 ? 1 : Math.max(0, 1 - (T - T_COLL0) / 900);
      /* sun */
      const sun = ctx.createRadialGradient(EX, EY, 0, EX, EY, SUNR * 2.4);
      sun.addColorStop(0, "rgba(244,240,232," + 0.95 * fade + ")");
      sun.addColorStop(0.4, "rgba(230,228,238," + 0.5 * fade + ")");
      sun.addColorStop(1, "rgba(230,228,238,0)");
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(EX, EY, SUNR * 2.4, 0, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(244,240,232," + fade + ")";
      ctx.beginPath();
      ctx.arc(EX, EY, SUNR, 0, 7);
      ctx.fill();
      /* corona at totality */
      if (totality > 0) {
        ctx.save();
        ctx.shadowColor = KV_HI;
        ctx.shadowBlur = 30 * totality;
        ctx.strokeStyle = "rgba(233,168,255," + 0.9 * totality + ")";
        ctx.lineWidth = 3 + 3 * totality;
        ctx.beginPath();
        ctx.arc(EX, EY, SUNR + 3, 0, 7);
        ctx.stroke();
        ctx.restore();
        const halo = ctx.createRadialGradient(EX, EY, SUNR, EX, EY, SUNR * 3.6);
        halo.addColorStop(0, "rgba(180,79,216," + 0.4 * totality + ")");
        halo.addColorStop(1, "rgba(180,79,216,0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(EX, EY, SUNR * 3.6, 0, 7);
        ctx.fill();
      }
      /* moon */
      const mx = EX + (1 - uApp) * -150,
        my = EY + (1 - uApp) * -110;
      ctx.fillStyle = "#0A1020";
      ctx.beginPath();
      ctx.arc(mx, my, SUNR + 1.5, 0, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(60,72,96," + 0.6 * fade + ")";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mx, my, SUNR + 1.5, 0, 7);
      ctx.stroke();
      /* diamond-ring flash at the exact moment */
      const fl = Math.max(0, 1 - Math.abs(T - T_FLASH) / 420);
      if (fl > 0) {
        const fx = EX + (SUNR + 2) * Math.cos(-0.7),
          fy = EY + (SUNR + 2) * Math.sin(-0.7);
        ctx.save();
        ctx.shadowColor = "#FFFFFF";
        ctx.shadowBlur = 26 * fl;
        ctx.fillStyle = "rgba(255,255,255," + fl + ")";
        ctx.beginPath();
        ctx.arc(fx, fy, 3 + 5 * fl, 0, 7);
        ctx.fill();
        for (let r = 0; r < 4; r++) {
          const a = -0.7 + (r * Math.PI) / 2;
          ctx.strokeStyle = "rgba(255,255,255," + 0.8 * fl + ")";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(fx + Math.cos(a) * 7, fy + Math.sin(a) * 7);
          ctx.lineTo(fx + Math.cos(a) * (16 + 16 * fl), fy + Math.sin(a) * (16 + 16 * fl));
          ctx.stroke();
        }
        ctx.restore();
        mono("THE MOMENT", EX, EY + SUNR + 34, "rgba(233,168,255," + fl + ")", 10, 600, "center");
      }
      /* the world darkens at totality */
      if (totality > 0) {
        ctx.fillStyle = "rgba(4,6,12," + 0.3 * totality + ")";
        ctx.fillRect(0, 0, W, H);
      }
    }

    /* the ride: day counter and return, small and quiet */
    if (rolling || arriving) {
      const u = arriving ? 1 : uRoll;
      const D = Math.min(105, Math.floor(u * 105));
      const V = Math.exp(Math.log(112) * hAt(u)); // backtest equity level, $1 → $112
      mono("D " + D + "/105", vx, vy + 44, "#93A0B4", 8.5, 600, "center");
      mono("$" + (V < 10 ? V.toFixed(2) : V.toFixed(0)), vx, vy + 58, KV_HI, 9, 600, "center");
      if (arriving && vAlpha > 0.1)
        mono(
          "105D · RELEASE",
          trajX(1),
          trajY(1) - 40,
          "rgba(233,168,255," + vAlpha + ")",
          9.5,
          600,
          "center",
        );
    }

    if (!REDUCED) raf = requestAnimationFrame(draw);
  }
  // Paint the first frame synchronously: hidden/throttled tabs suspend rAF,
  // and the card should never sit blank. draw() schedules the loop itself.
  draw(performance.now());
  return () => cancelAnimationFrame(raf);
}

export function KairosSignature({
  stats,
  chipLabel,
  chipLive,
}: {
  stats: SignatureStats | null;
  chipLabel: string;
  chipLive: boolean;
}) {
  return (
    <SignatureCard
      name="Kairos"
      greek="καιρός"
      tag="the exact right timing · god of luck"
      chipLabel={chipLabel}
      chipLive={chipLive}
      cardBackground="#0A1020"
      stats={stats}
      caption="the eclipse is the moment · its corona becomes the cyclone, collecting five names from the event streams · then it rolls up and to the right along the backtest trajectory, 105 days, rigid · score: EVENT .50 · M .20 · V/G/P .10 · "
      phCaption="trajectory traced from the real 2011–2026 backtest ($1 → $112, 38 rebalances) · [PH] streams simulated; paper-traded, no rebalance yet observed; no holdings shown"
      setup={setup}
    />
  );
}
