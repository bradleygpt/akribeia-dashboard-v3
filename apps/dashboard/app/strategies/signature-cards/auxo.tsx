"use client";

// Auxo — "neural v3" signature, transplanted verbatim from the approved
// akribeia_auxo_neural_v3.html. Seeds, timings, palette, gate threshold,
// grade ladder and text calls are the author's. Mechanical adaptations only:
// canvas via ref, rAF handle captured and cancelled on unmount, REDUCED read
// inside the effect (reduced motion draws exactly one static frame),
// setTransform reset before the authored ctx.scale, and minimal TypeScript
// typing (candidate/held interfaces; mAvg gets a behavior-neutral zero
// initializer — stepCand assigns it before any read).

import { SignatureCard, type SignatureStats } from "./signature-card";

interface Cand {
  q: number[];
  qb: number[];
  m: number[];
  mb: number[];
  disp: number;
  score: number;
  pass: boolean;
  yPos: number;
  mAvg: number;
}
interface Held {
  c: Cand;
  rank: number;
  score: number;
  grade: string;
  snapQ: number[];
  snapM: number[];
  snapAvg: number;
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

  const GRN = "#3DBA6A",
    GRN_HI = "#8CF0A8",
    ML = "#6E9CC4",
    ML_HI = "#A8CCEE";
  function mulberry32(a: number) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20260812);
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

  const QMETRICS = ["REV QOQ", "ERN QOQ", "REV YOY", "ERN YOY"];
  const MW4 = [0.35, 0.25, 0.2, 0.2]; // [PH]
  const MLCOLS = ["P+1M", "P+3M", "P+12M"];
  const GATE = 0.55; // [PH] ML gate threshold on mean P(+)

  /* zones */
  const RX0 = 24,
    RLW = 58; // row labels
  const QX0 = RX0 + RLW,
    QCW = 82; // quant cols
  const MLX0 = QX0 + 4 * QCW + 14,
    MLCW = 56; // ml cols
  const SC_X = 652,
    SC_Y0 = 58,
    SC_Y1 = H - 40; // score column
  const SL_X = 712,
    SL_W = 376,
    SL_Y0 = 56; // slots
  const MY0 = 66,
    ROWH = 34;

  /* candidates */
  const NC = 9;
  const cand: Cand[] = [];
  for (let i = 0; i < NC; i++) {
    const strong = i < 3;
    const q = [0, 1, 2, 3].map(() => rand());
    const hiQ = strong ? 0.82 + rand() * 0.12 : 0.3 + rand() * 0.45;
    const ml = [0, 1, 2].map(() => rand());
    // one teaching case: strong quant growth but ML says no (index 3)
    const hiM =
      i === 3 ? 0.34 + rand() * 0.06 : strong ? 0.62 + rand() * 0.15 : 0.4 + rand() * 0.25;
    cand.push({
      q,
      qb: q.map((v) => Math.max(0.15, Math.min(0.97, hiQ + (v - 0.5) * 0.22))),
      m: ml,
      mb: ml.map((v) => Math.max(0.15, Math.min(0.92, hiM + (v - 0.5) * 0.12))),
      disp: 0,
      score: 0,
      pass: true,
      yPos: 0,
      mAvg: 0,
    });
  }
  cand[3].qb = cand[3].qb.map(() => 0.86 + rand() * 0.1); // gated despite elite growth
  function stepCand(c: Cand) {
    for (let k = 0; k < 4; k++) {
      c.q[k] += (c.qb[k] - c.q[k]) * 0.02 + (rand() * 2 - 1) * 0.015;
      if (c.q[k] < 0.02) c.q[k] = 0.02;
      if (c.q[k] > 0.99) c.q[k] = 0.99;
    }
    for (let k = 0; k < 3; k++) {
      c.m[k] += (c.mb[k] - c.m[k]) * 0.02 + (rand() * 2 - 1) * 0.012;
      if (c.m[k] < 0.05) c.m[k] = 0.05;
      if (c.m[k] > 0.95) c.m[k] = 0.95;
    }
    c.mAvg = (c.m[0] + c.m[1] + c.m[2]) / 3;
    c.pass = c.mAvg >= GATE;
    c.score = 10 * (MW4[0] * c.q[0] + MW4[1] * c.q[1] + MW4[2] * c.q[2] + MW4[3] * c.q[3]);
    c.disp += (c.score - c.disp) * 0.06;
  }
  cand.forEach((c) => {
    for (let k = 0; k < 200; k++) stepCand(c);
    c.disp = c.score;
  });
  cand
    .slice()
    .sort((a, b) => b.disp - a.disp)
    .forEach((c, idx) => {
      c.yPos = MY0 + idx * ROWH;
    });

  function grade(s: number) {
    return s >= 9
      ? "A+"
      : s >= 8.5
        ? "A"
        : s >= 8
          ? "A-"
          : s >= 7.5
            ? "B+"
            : s >= 7
              ? "B"
              : s >= 6.5
                ? "B-"
                : s >= 6
                  ? "C+"
                  : "C";
  }
  function gradeCol(s: number) {
    return s >= 8 ? "#8CF0A8" : s >= 6.5 ? "#7FB08F" : "#5E6B80";
  }
  const yOfScore = (s: number) => SC_Y1 - (SC_Y1 - SC_Y0) * Math.max(0, Math.min(1, (s - 5) / 5));

  /* hold clock */
  const REB = 13000;
  let cycle = 42,
    lastCycle = -1,
    transT = -1e9;
  let held: Held[] = [];
  function rebalance(t: number) {
    const ranked = cand.filter((c) => c.pass).sort((a, b) => b.score - a.score);
    held = ranked.slice(0, 3).map((c, i) => ({
      c,
      rank: i + 1,
      score: c.score,
      grade: grade(c.score),
      snapQ: c.q.slice(),
      snapM: c.m.slice(),
      snapAvg: c.mAvg,
    }));
    transT = t;
    cycle++;
  }
  rebalance(0);

  /* background */
  const bg = document.createElement("canvas");
  bg.width = 2200;
  bg.height = 860;
  {
    const b = bg.getContext("2d")!;
    b.scale(DPR, DPR);
    for (let x = 20; x < W; x += 34)
      for (let y = 20; y < H; y += 34) {
        b.fillStyle = "rgba(130,150,185,0.05)";
        b.beginPath();
        b.arc(x, y, 1, 0, 7);
        b.fill();
      }
    const v = b.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    v.addColorStop(0, "rgba(10,15,26,0)");
    v.addColorStop(1, "rgba(6,9,17,0.55)");
    b.fillStyle = v;
    b.fillRect(0, 0, W, H);
  }

  const T0 = performance.now();
  const flowOff = [rand(), rand(), rand()];

  let raf = 0;
  function draw(now: number) {
    const t = now - T0;
    const cyc = Math.floor(t / REB);
    const cp = (t % REB) / REB;
    if (cyc !== lastCycle) {
      if (lastCycle >= 0) rebalance(t);
      lastCycle = cyc;
    }
    const evFlash = Math.max(0, 1 - (t - transT) / 1100);

    cand.forEach(stepCand);
    cand
      .slice()
      .sort((a, b) => b.disp - a.disp)
      .forEach((c, idx) => {
        const ty = MY0 + idx * ROWH;
        c.yPos += (ty - c.yPos) * 0.07;
      });
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0, W, H);

    const heldSet = new Set(held.map((h) => h.c));

    /* headers */
    mono("QUANT GROWTH · SECTOR PCTILE", QX0, 20, "#5E6B80", 10, 500);
    mono("MLPRED · P(+)", MLX0, 20, ML, 10, 500);
    QMETRICS.forEach((m, k) =>
      mono(m, QX0 + k * QCW + QCW / 2 - 7, 46, "#5E6B80", 8, 500, "center"),
    );
    MLCOLS.forEach((m, k) => mono(m, MLX0 + k * MLCW + MLCW / 2 - 6, 46, ML, 8, 500, "center"));
    // divider between input families
    ctx.strokeStyle = "rgba(110,125,150,0.2)";
    ctx.beginPath();
    ctx.moveTo(MLX0 - 8, 34);
    ctx.lineTo(MLX0 - 8, MY0 + NC * ROWH - 8);
    ctx.stroke();

    /* the matrix */
    cand.forEach((c, i) => {
      const y = c.yPos;
      const isHeld = heldSet.has(c);
      const rowA = c.pass ? 1 : 0.42;
      ctx.globalAlpha = rowA;
      mono("CAND-" + (i + 1), RX0, y + 15, isHeld ? GRN_HI : "#5E6B80", 9, isHeld ? 600 : 400);
      for (let k = 0; k < 4; k++) {
        const x = QX0 + k * QCW;
        ctx.fillStyle = "rgba(110,125,150,0.12)";
        ctx.fillRect(x, y + 3, QCW - 12, 15);
        ctx.fillStyle = GRN;
        ctx.globalAlpha = rowA * (0.3 + 0.6 * c.q[k]);
        ctx.fillRect(x, y + 3, (QCW - 12) * c.q[k], 15);
        ctx.globalAlpha = rowA;
        mono(
          Math.round(c.q[k] * 100) + "",
          x + QCW - 16,
          y + 14.5,
          c.q[k] > 0.75 ? GRN_HI : "#5E6B80",
          8,
          c.q[k] > 0.75 ? 600 : 400,
          "right",
        );
      }
      for (let k = 0; k < 3; k++) {
        const x = MLX0 + k * MLCW;
        ctx.fillStyle = "rgba(110,140,170,0.12)";
        ctx.fillRect(x, y + 3, MLCW - 10, 15);
        ctx.fillStyle = ML;
        ctx.globalAlpha = rowA * (0.3 + 0.6 * c.m[k]);
        ctx.fillRect(x, y + 3, (MLCW - 10) * c.m[k], 15);
        ctx.globalAlpha = rowA;
        mono(
          "." + Math.round(c.m[k] * 100),
          x + MLCW - 13,
          y + 14.5,
          c.m[k] >= GATE ? ML_HI : "#5E6B80",
          7.5,
          c.m[k] >= GATE ? 600 : 400,
          "right",
        );
      }
      ctx.globalAlpha = 1;
      if (!c.pass) mono("GATED", MLX0 + 3 * MLCW + 8, y + 15, "#7A5A5A", 8, 600);
      if (isHeld) {
        ctx.strokeStyle = "rgba(140,240,168,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(RX0 - 5, y, RLW + 4 * QCW + 14 + 3 * MLCW - 4, 22);
      }
    });
    mono("GATE: MEAN P(+) ≥ " + GATE.toFixed(2), QX0, MY0 + NC * ROWH + 14, ML, 8, 500);

    /* score column: survivors only */
    mono("GROWTH SCORE", SC_X, 20, "#5E6B80", 10, 500, "center");
    mono("WEIGHT 70%", SC_X, 34, "#3E4C64", 8, 400, "center");
    (
      [
        ["A", 8.5, 10],
        ["B", 6.5, 8.5],
        ["C", 5, 6.5],
      ] as [string, number, number][]
    ).forEach(([g, lo, hi]) => {
      const y1 = yOfScore(hi),
        y2 = yOfScore(lo);
      ctx.fillStyle =
        g === "A"
          ? "rgba(140,240,168,0.07)"
          : g === "B"
            ? "rgba(140,240,168,0.035)"
            : "rgba(110,125,150,0.03)";
      ctx.fillRect(SC_X - 18, y1, 36, y2 - y1);
      mono(g, SC_X - 26, (y1 + y2) / 2 + 3, g === "A" ? "#8CF0A8" : "#5E6B80", 9, 600, "right");
    });
    ctx.strokeStyle = "rgba(110,125,150,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(SC_X, SC_Y0 - 4);
    ctx.lineTo(SC_X, SC_Y1 + 4);
    ctx.stroke();
    [5, 6, 7, 8, 9, 10].forEach((v) => {
      const y = yOfScore(v);
      ctx.beginPath();
      ctx.moveTo(SC_X - 4, y);
      ctx.lineTo(SC_X + 4, y);
      ctx.stroke();
      mono(v.toFixed(0), SC_X + 24, y + 3, "#3E4C64", 8, 400);
    });
    cand.forEach((c) => {
      const y = yOfScore(c.disp);
      const isHeld = heldSet.has(c);
      if (!c.pass) {
        ctx.strokeStyle = "rgba(122,90,90,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(SC_X - 3, y - 3);
        ctx.lineTo(SC_X + 3, y + 3);
        ctx.moveTo(SC_X + 3, y - 3);
        ctx.lineTo(SC_X - 3, y + 3);
        ctx.stroke();
        return;
      }
      ctx.save();
      if (isHeld) {
        ctx.shadowColor = GRN_HI;
        ctx.shadowBlur = 10;
      }
      ctx.fillStyle = isHeld ? GRN_HI : "rgba(120,170,140,0.6)";
      ctx.beginPath();
      ctx.arc(SC_X, y, isHeld ? 4 : 2.6, 0, 7);
      ctx.fill();
      ctx.restore();
    });

    /* held flow particles */
    held.forEach((h, i) => {
      const ry = h.c.yPos + 11,
        sy = yOfScore(h.c.disp),
        ty = SL_Y0 + 26 + i * 112 + 40;
      const xEnd = MLX0 + 3 * MLCW - 6;
      ctx.strokeStyle = "rgba(140,240,168,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xEnd, ry);
      ctx.bezierCurveTo(SC_X - 46, ry, SC_X - 30, sy, SC_X - 6, sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(SC_X + 6, sy);
      ctx.bezierCurveTo(SC_X + 40, sy, SL_X - 40, ty, SL_X - 4, ty);
      ctx.stroke();
      const u = (t * 0.00016 + flowOff[i]) % 1;
      let px, py;
      function bez(
        x0: number,
        y0: number,
        c1x: number,
        c1y: number,
        c2x: number,
        c2y: number,
        x1: number,
        y1: number,
        q: number,
      ) {
        const mt = 1 - q;
        return [
          mt * mt * mt * x0 + 3 * mt * mt * q * c1x + 3 * mt * q * q * c2x + q * q * q * x1,
          mt * mt * mt * y0 + 3 * mt * mt * q * c1y + 3 * mt * q * q * c2y + q * q * q * y1,
        ];
      }
      if (u < 0.5) [px, py] = bez(xEnd, ry, SC_X - 46, ry, SC_X - 30, sy, SC_X - 6, sy, u / 0.5);
      else
        [px, py] = bez(SC_X + 6, sy, SC_X + 40, sy, SL_X - 40, ty, SL_X - 4, ty, (u - 0.5) / 0.5);
      ctx.save();
      ctx.shadowColor = GRN;
      ctx.shadowBlur = 7;
      ctx.fillStyle = GRN_HI;
      ctx.beginPath();
      ctx.arc(px, py, 1.9, 0, 7);
      ctx.fill();
      ctx.restore();
    });

    /* selected book */
    mono("SELECTED · TOP 3", SL_X, 20, "#5E6B80", 10, 500);
    mono(
      "HOLD " + Math.round(cp * 100) + "% OF 5M",
      W - 6,
      20,
      evFlash > 0 ? GRN_HI : "#3E4C64",
      8.5,
      evFlash > 0 ? 600 : 400,
      "right",
    );
    if (evFlash > 0)
      mono(
        "REBALANCE",
        W - 6,
        34,
        "rgba(140,240,168," + (0.4 + 0.6 * evFlash) + ")",
        9,
        600,
        "right",
      );
    const blink = evFlash > 0 ? 0.25 + 0.75 * (1 - evFlash) : 1; // dip then brighten: the blink
    held.forEach((h, i) => {
      const y = SL_Y0 + 26 + i * 112;
      const c = h.c,
        liveGrade = grade(c.score);
      ctx.globalAlpha = blink;
      ctx.fillStyle = "#0A1120";
      ctx.strokeStyle = evFlash > 0.1 ? GRN_HI : "#22304A";
      ctx.lineWidth = 1 + 1.1 * evFlash;
      if (evFlash > 0.1) {
        ctx.save();
        ctx.shadowColor = GRN_HI;
        ctx.shadowBlur = 16 * evFlash;
      }
      ctx.beginPath();
      ctx.roundRect(SL_X, y, SL_W, 100, 6);
      ctx.fill();
      ctx.stroke();
      if (evFlash > 0.1) ctx.restore();
      mono("RANK " + h.rank, SL_X + 14, y + 22, "#93A0B4", 10, 600);
      mono("SCORE " + c.score.toFixed(2), SL_X + 14, y + 42, GRN_HI, 12, 600);
      mono(liveGrade, SL_X + 14, y + 64, gradeCol(c.score), 13, 600);
      mono(
        "ML P(+) " + c.mAvg.toFixed(2) + (c.mAvg >= GATE ? " · PASS" : " · WATCH"),
        SL_X + 14,
        y + 86,
        c.mAvg >= GATE ? ML_HI : "#C4A96B",
        8.5,
        500,
      );
      QMETRICS.forEach((m, k) => {
        const mx = SL_X + 140 + (k % 2) * 118,
          my = y + (k < 2 ? 24 : 60);
        mono(m, mx, my, "#5E6B80", 7.5, 400);
        ctx.fillStyle = "rgba(110,125,150,0.12)";
        ctx.fillRect(mx, my + 5, 86, 9);
        ctx.fillStyle = GRN;
        ctx.globalAlpha = blink * (0.35 + 0.55 * c.q[k]);
        ctx.fillRect(mx, my + 5, 86 * c.q[k], 9);
        ctx.globalAlpha = blink;
        mono(
          Math.round(c.q[k] * 100) + "th",
          mx + 86 + 24,
          my + 13,
          c.q[k] > 0.75 ? GRN_HI : "#5E6B80",
          8,
          500,
          "right",
        );
      });
      ctx.globalAlpha = 1;
    });

    if (!REDUCED) raf = requestAnimationFrame(draw);
  }
  // Paint the first frame synchronously: hidden/throttled tabs suspend rAF,
  // and the card should never sit blank. draw() schedules the loop itself.
  draw(performance.now());
  return () => cancelAnimationFrame(raf);
}

export function AuxoSignature({
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
      name="Auxo"
      greek="Αὐξώ"
      chipLabel={chipLabel}
      chipLive={chipLive}
      cardBackground="#0C1322"
      stats={stats}
      caption="inputs: quant growth percentiles + MLPred probability streams · ML gates the universe, the growth pillar ranks the survivors · top 3 on the 5-month clock · "
      phCaption="[PH] percentiles, probabilities, gate threshold, and weights simulated; no holdings shown"
      setup={setup}
    />
  );
}
