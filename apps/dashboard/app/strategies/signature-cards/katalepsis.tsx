"use client";

// Katalepsis — "neural v4" signature, transplanted verbatim from the approved
// akribeia_katalepsis_neural_v4.html. Seeds, timings, palette, phase machine,
// easing and text calls are the author's. Mechanical adaptations only:
// canvas via ref, rAF handle captured and cancelled on unmount, REDUCED read
// inside the effect (reduced motion draws exactly one static frame),
// setTransform reset before the authored ctx.scale (idempotent re-mounts),
// and minimal TypeScript parameter/collection typing.

import { SignatureCard, type SignatureStats } from "./signature-card";

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

  const CATS = [
    { name: "PRICE", col: "#4E8FD0" },
    { name: "FUND", col: "#3FB8AF" },
    { name: "EVENT", col: "#7C6FD9" },
    { name: "SENT", col: "#5A9ED0" },
    { name: "INSIDER", col: "#4FC98F" },
  ];
  const INPUTS = [
    "MOM-63D",
    "TREND-RES",
    "VOL-COMP",
    "EPS-REV",
    "MARGIN-Δ",
    "ACCRUALS",
    "EARN-DRIFT",
    "GUIDE-Δ",
    "8K-FLOW",
    "FIL-TONE",
    "NEWS-DISP",
    "EST-BREADTH",
    "NET-BUY",
    "CLUSTER-BUY",
    "10B5-GAP",
  ];

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

  const IX = 142,
    HX = 560,
    OX = 880,
    SX = 966;
  const iY = (i: number) => 36 + (i * (H - 70)) / 14;
  const hY = (i: number) => H / 2 - 8 + (i - 2) * 72;
  const OY = H / 2 - 8;

  const Wih: number[][] = [];
  for (let i = 0; i < 15; i++) {
    Wih.push([]);
    for (let h = 0; h < 5; h++) {
      const within = Math.floor(i / 3) === h;
      Wih[i][h] = within ? 0.65 + rand() * 0.3 : 0.04 + rand() * 0.1;
    }
  }
  const flowOff = INPUTS.map(() => rand());
  const flowOff2 = INPUTS.map(() => rand());
  const hidJit = [0, 1, 2, 3, 4].map(() => rand() * 0.1);

  /* continuous input state */
  const biases = INPUTS.map(() => 0.54 + rand() * 0.14);
  const act = biases.slice(),
    hid = [0, 0, 0, 0, 0];
  function stepContinuous() {
    for (let i = 0; i < 15; i++) {
      act[i] += (biases[i] - act[i]) * 0.02 + (rand() * 2 - 1) * 0.016;
      if (act[i] > 0.95) act[i] = 0.95;
      if (act[i] < 0.05) act[i] = 0.05;
    }
    for (let h = 0; h < 5; h++) {
      let s = 0,
        ws = 0;
      for (let i = 0; i < 15; i++) {
        s += act[i] * Wih[i][h];
        ws += Wih[i][h];
      }
      hid[h] += (s / ws - hid[h]) * 0.06;
    }
  }
  for (let k = 0; k < 400; k++) stepContinuous();

  /* rebalance cycle */
  const REB = 12000,
    DISCHARGE = 1400; // last 1.4s of the cycle
  let cycle = 137,
    lastCycle = -1,
    out = 0,
    slots: { rank: number; p: number }[] = [];
  const hist: number[] = []; // posterior per past rebalance
  function fireRebalance() {
    let L = 0;
    act.forEach((a) => {
      const p = 0.32 + 0.36 * a;
      L += Math.log(p / (1 - p));
    });
    out = 1 / (1 + Math.exp(-L * 0.62));
    slots = [0, 1, 2].map((i) => ({
      rank: i + 1,
      p: Math.max(0.55, Math.min(0.97, out - 0.018 * i - 0.008 + rand() * 0.016)),
    }));
    hist.push(out);
    if (hist.length > 10) hist.shift();
    cycle++;
  }
  fireRebalance();

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

  function nodeDraw(x: number, y: number, r: number, col: string, a: number, flash: number) {
    const halo = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * (1.7 + 1.3 * flash));
    halo.addColorStop(0, col + "66");
    halo.addColorStop(1, col + "00");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * (1.7 + 1.3 * flash), 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fillStyle = "#0A1120";
    ctx.fill();
    const core = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r * 0.95);
    core.addColorStop(0, col);
    core.addColorStop(1, col + "22");
    ctx.globalAlpha = 0.2 + 0.8 * a;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, 0, 7);
    ctx.fillStyle = core;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.stroke();
  }
  function edgePath(x1: number, y1: number, x2: number, y2: number) {
    const mx = (x1 + x2) / 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
  }
  function bezPt(x1: number, y1: number, x2: number, y2: number, u: number) {
    const mx = (x1 + x2) / 2,
      mt = 1 - u;
    return [
      mt * mt * mt * x1 + 3 * mt * mt * u * mx + 3 * mt * u * u * mx + u * u * u * x2,
      mt * mt * mt * y1 + 3 * mt * mt * u * y1 + 3 * mt * u * u * y2 + u * u * u * y2,
    ];
  }
  function pulseDraw(x: number, y: number, col: string, r: number, blur?: number) {
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = blur ?? 12;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
    ctx.restore();
  }
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

  let raf = 0;
  function draw(now: number) {
    const t = now - T0;
    const cyc = Math.floor(t / REB);
    const cp = (t % REB) / REB; // cycle progress 0..1
    const dis = t % REB > REB - DISCHARGE ? ((t % REB) - (REB - DISCHARGE)) / DISCHARGE : -1; // 0..1 in discharge
    if (cyc !== lastCycle) {
      if (lastCycle >= 0) fireRebalance();
      lastCycle = cyc;
    }
    const charge = Math.min(1, cp / ((REB - DISCHARGE) / REB)); // fill reaches 1 as discharge begins

    stepContinuous();
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0, W, H);

    // ---- STAGE 1 · continuous streams into the hidden layer ----
    for (let i = 0; i < 15; i++)
      for (let h = 0; h < 5; h++) {
        const within = Math.floor(i / 3) === h;
        edgePath(IX + 11, iY(i), HX - 17, hY(h));
        if (within) {
          ctx.strokeStyle = CATS[h].col;
          ctx.globalAlpha = 0.32;
          ctx.lineWidth = 0.9 + 2.2 * Wih[i][h];
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = "rgba(110,125,150,0.09)";
          ctx.lineWidth = 0.8 + 1.2 * Wih[i][h];
          ctx.stroke();
        }
      }
    // two counter-phased particles per stream: the flow never stops
    for (let i = 0; i < 15; i++) {
      const h = Math.floor(i / 3);
      [flowOff[i], flowOff2[i]].forEach((off, j) => {
        const u = (t * 0.00013 * (0.8 + act[i]) + off + j * 0.5) % 1;
        const [px, py] = bezPt(IX + 11, iY(i), HX - 17, hY(h), u);
        pulseDraw(px, py, CATS[h].col + (j ? "77" : "AA"), 1.8, 5);
      });
    }

    // ---- STAGE 2 · accumulation: charge rings fill over the cycle ----
    for (let h = 0; h < 5; h++) {
      const x = HX,
        y = hY(h);
      nodeDraw(
        x,
        y,
        15,
        CATS[h].col,
        hid[h] * charge,
        dis >= 0 ? sm(1 - Math.abs(dis - 0.1) / 0.2) : 0,
      );
      // charge ring
      const ringR = 22;
      ctx.beginPath();
      ctx.arc(x, y, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(110,125,150,0.18)";
      ctx.lineWidth = 3;
      ctx.stroke();
      const fillTo = -Math.PI / 2 + Math.PI * 2 * (dis >= 0 ? (1 - sm(dis)) * 1 : charge);
      ctx.beginPath();
      ctx.arc(x, y, ringR, -Math.PI / 2, fillTo);
      ctx.strokeStyle = CATS[h].col;
      ctx.lineWidth = 3.4;
      ctx.save();
      if (charge > 0.85 || dis >= 0) {
        ctx.shadowColor = CATS[h].col;
        ctx.shadowBlur = 10;
      }
      ctx.stroke();
      ctx.restore();
      mono(CATS[h].name, x, y - 32, "#5E6B80", 8.5, 400, "center");
    }

    // ---- STAGE 3 · dormant until rebalance, then discharge to output ----
    for (let h = 0; h < 5; h++) {
      edgePath(HX + 17, hY(h), OX - 28, OY);
      if (dis >= 0) {
        ctx.strokeStyle = "#E8B54D";
        ctx.globalAlpha = 0.3 + 0.55 * sm(dis);
        ctx.lineWidth = 1.6 + 2.6 * sm(dis);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = "rgba(150,140,110,0.10)";
        ctx.lineWidth = 1.2;
        ctx.stroke(); // dormant
      }
    }
    if (dis >= 0) {
      for (let h = 0; h < 5; h++) {
        const u0 = (dis - 0.05 - hidJit[h]) / 0.45;
        if (u0 > 0 && u0 < 1) {
          const [px, py] = bezPt(HX + 17, hY(h), OX - 28, OY, sm(u0));
          pulseDraw(px, py, "#E8B54D", 3 + 2.6 * hid[h]);
        }
      }
    }

    // output neuron: quiet between rebalances, blooms on discharge
    const fOut = dis >= 0 ? sm(1 - Math.abs(dis - 0.72) / 0.28) : 0;
    nodeDraw(OX, OY, 27, "#E8B54D", dis >= 0 ? 0.4 + 0.6 * sm(dis) : 0.35, fOut);
    mono("σ", OX, OY + 5.5, "#0A1120", 16, 600, "center");
    mono("p=" + out.toFixed(3), OX, OY + 50, "#E8B54D", 13, 600, "center");
    mono("LAST REBALANCE", OX, OY + 64, "#3E4C64", 7.5, 400, "center");

    // step history of past rebalances
    {
      const tx0 = OX - 52,
        tx1 = OX + 52,
        ty0 = OY + 78,
        th = 30;
      ctx.strokeStyle = "rgba(90,110,140,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx0, ty0 + th);
      ctx.lineTo(tx1, ty0 + th);
      ctx.stroke();
      if (hist.length > 1) {
        ctx.beginPath();
        hist.forEach((v, k) => {
          const x0 = tx0 + ((tx1 - tx0) * k) / hist.length,
            x1b = tx0 + ((tx1 - tx0) * (k + 1)) / hist.length;
          const y = ty0 + th - ((v - 0.5) / 0.5) * th;
          if (k) ctx.lineTo(x0, y);
          else ctx.moveTo(x0, y);
          ctx.lineTo(x1b, y);
        });
        ctx.strokeStyle = "#E8B54D";
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      mono("PAST REBALANCES", OX, ty0 + th + 11, "#3E4C64", 8, 500, "center");
    }

    // headers + cycle telemetry
    mono("INPUT ×15 · STREAMING", IX - 11, 16, "#5E6B80", 10, 500);
    for (let i = 0; i < 15; i++) {
      nodeDraw(IX, iY(i), 10, CATS[Math.floor(i / 3)].col, act[i], 0);
      mono(INPUTS[i], IX - 18, iY(i) + 3.5, "#5E6B80", 8.5, 400, "right");
    }
    mono("HIDDEN ×5 · ACCUMULATING", HX - 14, 16, "#5E6B80", 10, 500, "center");
    mono("OUTPUT · ON REBALANCE", OX - 24, 16, "#5E6B80", 10, 500);
    mono("CYCLE #" + String(cycle).padStart(4, "0"), W - 6, 16, "#5E6B80", 10, 500, "right");
    mono(
      dis >= 0 ? "REBALANCING" : "CHARGE " + Math.round(charge * 100) + "%",
      W - 6,
      32,
      dis >= 0 ? "#E8B54D" : "#3E4C64",
      8.5,
      dis >= 0 ? 600 : 400,
      "right",
    );

    // suggestions
    mono("SUGGESTED BOOK", SX, OY - 104, "#5E6B80", 9.5, 500);
    mono("21D HOLD · MONTHLY REBALANCE", SX, OY - 91, "#3E4C64", 8, 400);
    const rebFlash = dis >= 0 ? sm(1 - Math.abs(dis - 0.85) / 0.2) : 0;
    slots.forEach((s, i) => {
      const y = OY - 78 + i * 58;
      edgePath(OX + 27, OY, SX - 6, y + 22);
      ctx.strokeStyle = "rgba(232,181,77," + (0.1 + 0.25 * rebFlash) + ")";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "#0A1120";
      ctx.strokeStyle = rebFlash > 0.1 ? "#E8B54D" : "#22304A";
      ctx.lineWidth = 1 + 1.2 * rebFlash;
      if (rebFlash > 0.1) {
        ctx.save();
        ctx.shadowColor = "#E8B54D";
        ctx.shadowBlur = 16 * rebFlash;
      }
      ctx.beginPath();
      ctx.roundRect(SX, y, 92, 44, 6);
      ctx.fill();
      ctx.stroke();
      if (rebFlash > 0.1) ctx.restore();
      mono("RANK " + s.rank, SX + 12, y + 18, "#93A0B4", 10, 600);
      mono("p=" + s.p.toFixed(2), SX + 12, y + 35, "#E8B54D", 11, 500);
    });
    if (rebFlash > 0.1)
      mono(
        "REBALANCE",
        SX + 46,
        OY + 108,
        "rgba(232,181,77," + (0.4 + 0.6 * rebFlash) + ")",
        10,
        600,
        "center",
      );

    if (!REDUCED) raf = requestAnimationFrame(draw);
  }
  // Paint the first frame synchronously: hidden/throttled tabs suspend rAF,
  // and the card should never sit blank. draw() schedules the loop itself.
  draw(performance.now());
  return () => cancelAnimationFrame(raf);
}

export function KatalepsisSignature({
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
      name="Katalepsis"
      greek="κατάληψις"
      chipLabel={chipLabel}
      chipLive={chipLive}
      cardBackground="#0C1322"
      stats={stats}
      caption="streams flow continuously · evidence accumulates in the hidden layer over the cycle · only at rebalance does it discharge to the output · "
      phCaption="[PH] data simulated; no holdings shown"
      setup={setup}
    />
  );
}
