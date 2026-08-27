"use client";

// Statera — "neural v4" signature, transplanted verbatim from the approved
// akribeia_statera_neural_v4.html. Seeds, timings, palette, the scan/watch/
// event/verdict state machine and text calls are the author's. Mechanical
// adaptations only: canvas via ref, rAF handle captured and cancelled on
// unmount, REDUCED read inside the effect (reduced motion draws exactly one
// static frame), setTransform reset before the authored ctx.scale, and
// minimal TypeScript typing (visit/book interfaces; the visit's meanY/v get
// behavior-neutral zero initializers — both are assigned two statements
// later, before any read).

import { SignatureCard, type SignatureStats } from "./signature-card";

interface Verdict {
  txt: string;
  col: string;
  t: number;
  buy?: boolean;
}
interface Visit {
  sector: string;
  p: number;
  mean: number;
  px: number[];
  eventAt: number;
  dropped: boolean;
  verdict: Verdict | null;
  buyX: number;
  buyY: number;
  meanY: number;
  v: number;
}
interface BookRow {
  sector: string;
  entry: number;
  now: number;
  addT: number;
  spark: number[];
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

  const CU = "#C98F5A",
    CU_HI = "#EFC08F",
    ML = "#6E9CC4",
    GRN = "#8CF0A8",
    EV_HI = "#E9A8FF";
  const SLV_COLS = ["#E8B54D", "#8CF0A8", "#38B6E0", "#B44FD8"];
  function mulberry32(a: number) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20260814);
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
  const GATE = 0.55;

  /* ---- left: covered sectors + the scale (kept from v3) ---- */
  const SECX = 24,
    PVX = 248,
    PVY = 176,
    BEAM = 92;
  const COVERED = [
    { s: "SEMIS", by: [0, 1, 2] },
    { s: "TECH HW", by: [0, 2] },
    { s: "SOFTWARE", by: [1, 2] },
    { s: "AI INFRA", by: [0, 1, 2, 3] },
    { s: "COMMS", by: [3] },
    { s: "CONS DSC", by: [1, 3] },
  ];
  const COVSET = new Set(COVERED.map((c) => c.s));

  /* ---- the hunt ---- */
  const STRIP = [
    "ENERGY",
    "SEMIS",
    "UTIL",
    "FINL",
    "SOFTWARE",
    "MATL",
    "HLTH",
    "TECH HW",
    "STAPLES",
    "INDL",
    "COMMS",
    "REIT",
  ];
  const SX0 = 380,
    SXW = 41,
    SY = 54; // sector strip
  const CX0 = 380,
    CX1 = 846,
    CY0 = 108,
    CY1 = 336; // price chart
  const BKX = 880; // book column

  /* scan state machine */
  let scanIdx = 0,
    phase = "SCAN",
    phaseT = 0,
    visitN = 0;
  let cur!: Visit;
  const book: BookRow[] = [];
  function newVisit(t: number) {
    // advance the cursor, skipping covered sectors with a visible skip flash
    let hops = 0;
    do {
      scanIdx = (scanIdx + 1) % STRIP.length;
      hops++;
    } while (COVSET.has(STRIP[scanIdx]) && hops < STRIP.length);
    visitN++;
    const sector = STRIP[scanIdx];
    const eventVisit = visitN % 3 === 0 || visitN % 4 === 0;
    const mlFail = visitN % 6 === 0;
    cur = {
      sector,
      p: mlFail ? 0.38 + rand() * 0.1 : 0.58 + rand() * 0.28,
      mean: 0.5,
      px: [],
      eventAt: eventVisit ? 900 + rand() * 500 : -1,
      dropped: false,
      verdict: null,
      buyX: 0,
      buyY: 0,
      meanY: 0,
      v: 0,
    };
    const base = CY0 + (CY1 - CY0) * 0.42;
    cur.meanY = base;
    cur.v = base;
    for (let k = 0; k < 70; k++) {
      stepPx();
    }
    phase = "WATCH";
    phaseT = t;
  }
  function stepPx() {
    cur.v += (cur.meanY - cur.v) * 0.06 + (rand() * 2 - 1) * 3.2;
    cur.px.push(cur.v);
    if (cur.px.length > 170) cur.px.shift();
  }

  /* pre-seed a small book: the scale starts REST-heavy and levels as it fills */
  ["ENERGY", "UTIL", "FINL"].forEach((s) => {
    const e = -(0.28 + rand() * 0.1);
    book.push({
      sector: s,
      entry: e,
      now: e * (0.75 + rand() * 0.15),
      addT: -1e9,
      spark: [...Array(26)].map((_, k) => k * 0.5 + rand() * 3),
    });
  });

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
  let net = 0,
    restMass = 0.72;
  newVisit(0);

  let raf = 0;
  function draw(now: number) {
    const t = now - T0;
    const ph = t - phaseT;

    /* ---- state machine ---- */
    if (phase === "WATCH") {
      stepPx();
      if (cur.eventAt > 0 && ph > cur.eventAt && !cur.dropped) {
        phase = "EVENT";
        phaseT = t;
      } else if (cur.eventAt < 0 && ph > 1700) {
        cur.verdict = { txt: "NO DISLOCATION · NEXT →", col: "#5E6B80", t };
        phase = "VERDICT";
        phaseT = t;
      }
    } else if (phase === "EVENT") {
      // the gap-down: price action falls hard over ~450ms
      const q = Math.min(1, ph / 450);
      const targetDrop = (CY1 - CY0) * 0.34;
      cur.v = cur.meanY + targetDrop * q + (rand() * 2 - 1) * 1.5;
      cur.px.push(cur.v);
      if (cur.px.length > 170) cur.px.shift();
      if (q >= 1 && !cur.dropped) {
        cur.dropped = true;
        cur.buyX = CX0 + (CX1 - CX0) * ((cur.px.length - 1) / 169);
        cur.buyY = cur.v;
        const uncov = !COVSET.has(cur.sector),
          mlOK = cur.p >= GATE;
        if (uncov && mlOK && book.length < 8) {
          cur.verdict = { txt: "BUY", col: CU_HI, buy: true, t };
          const e = -(0.3 + rand() * 0.1);
          book.unshift({
            sector: cur.sector,
            entry: e,
            now: e,
            addT: t,
            spark: [...Array(26)].map((_, k) => k * 0.4 + rand() * 3),
          });
          if (book.length > 8) book.pop();
        } else if (!mlOK) {
          cur.verdict = { txt: "ML ✗ · PASS", col: "#B07070", t };
        } else {
          cur.verdict = { txt: "BOOK FULL · PASS", col: "#5E6B80", t };
        }
        phase = "VERDICT";
        phaseT = t;
      }
    } else if (phase === "VERDICT") {
      stepPx();
      if (ph > (cur.verdict && cur.verdict.buy ? 1900 : 900)) newVisit(t);
    }

    book.forEach((b) => {
      b.now += 0.000115 * (1 + 0.4 * rand()); // reversion toward FV, live
      if (b.now > -0.06) b.now = -0.06;
      b.spark.push(b.spark[b.spark.length - 1] + 0.25 + rand() * 0.9);
      if (b.spark.length > 26) b.spark.shift();
    });
    restMass += (0.72 - restMass) * 0.02 + (rand() * 2 - 1) * 0.006;
    const bookMass = restMass * (book.length / 8) * (0.92 + 0.08 * rand());
    net += ((restMass - bookMass) * 0.9 - net) * 0.05;

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0, W, H);

    /* ---- covered sectors + scale ---- */
    mono("COVERED BY OTHER SLEEVES", SECX, 20, "#5E6B80", 10, 500);
    COVERED.forEach((cv2, i) => {
      const y = 44 + i * 32;
      ctx.fillStyle = "#0A1120";
      ctx.strokeStyle = "#22304A";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(SECX, y, 118, 24, 4);
      ctx.fill();
      ctx.stroke();
      mono(cv2.s, SECX + 8, y + 16, "#93A0B4", 8.5, 500);
      cv2.by.forEach((b, j) => {
        ctx.fillStyle = SLV_COLS[b];
        ctx.beginPath();
        ctx.arc(SECX + 104 - j * 9, y + 12, 2.6, 0, 7);
        ctx.fill();
      });
      ctx.strokeStyle = "rgba(140,240,168,0.13)";
      ctx.beginPath();
      ctx.moveTo(SECX + 118, y + 12);
      ctx.bezierCurveTo(SECX + 150, y + 12, PVX - 70, PVY - 8, PVX - BEAM, PVY + 10);
      ctx.stroke();
    });
    const ang = Math.max(-0.13, Math.min(0.13, -net * 0.3));
    const lx = PVX - Math.cos(ang) * BEAM,
      ly = PVY - Math.sin(ang) * BEAM;
    const rx = PVX + Math.cos(ang) * BEAM,
      ry = PVY + Math.sin(ang) * BEAM;
    ctx.strokeStyle = "rgba(148,160,180,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(PVX, PVY + 6);
    ctx.lineTo(PVX, H - 96);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(PVX - 24, H - 96);
    ctx.lineTo(PVX + 24, H - 96);
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = "#D7DEE9";
    ctx.shadowBlur = 4;
    ctx.strokeStyle = "#D7DEE9";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#0C1322";
    ctx.strokeStyle = "#D7DEE9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(PVX, PVY, 4.6, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = GRN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx, ly + 11);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(lx, ly + 11, 8, 0, Math.PI);
    ctx.stroke();
    ctx.strokeStyle = CU_HI;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx, ry + 11);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rx, ry + 11, 8, 0, Math.PI);
    ctx.stroke();
    mono("REST", lx, ly - 10, GRN, 7.5, 600, "center");
    mono("STATERA", rx, ry - 10, CU_HI, 7.5, 600, "center");
    mono(
      "NET " + (net >= 0 ? "+" : "") + net.toFixed(2),
      PVX,
      H - 76,
      "#D7DEE9",
      10.5,
      600,
      "center",
    );
    mono("BOOK " + book.length + "/8", PVX, H - 60, CU_HI, 8.5, 600, "center");
    mono(
      Math.abs(net) < 0.06 ? "BALANCED" : "FILLING · BALANCING",
      PVX,
      H - 46,
      Math.abs(net) < 0.06 ? GRN : "#5E6B80",
      7.5,
      600,
      "center",
    );

    /* ---- sector strip: the hunt flashing across sectors ---- */
    mono("SECTOR HUNT", SX0, 20, "#5E6B80", 10, 500);
    STRIP.forEach((s, i) => {
      const x = SX0 + i * SXW;
      const covered = COVSET.has(s);
      const active = i === scanIdx;
      ctx.fillStyle = active ? "rgba(201,143,90,0.20)" : "#0A1120";
      ctx.strokeStyle = active ? CU_HI : covered ? "#1B2537" : "#22304A";
      ctx.lineWidth = active ? 1.5 : 1;
      if (active) {
        ctx.save();
        ctx.shadowColor = CU_HI;
        ctx.shadowBlur = 10;
      }
      ctx.beginPath();
      ctx.roundRect(x, SY - 16, SXW - 6, 22, 4);
      ctx.fill();
      ctx.stroke();
      if (active) ctx.restore();
      mono(
        s.slice(0, 5),
        x + (SXW - 6) / 2,
        SY - 1,
        covered ? "#3E4C64" : active ? CU_HI : "#7A8698",
        6.3,
        active ? 600 : 400,
        "center",
      );
      if (covered) {
        ctx.strokeStyle = "rgba(90,100,120,0.7)";
        ctx.beginPath();
        ctx.moveTo(x + 6, SY - 5);
        ctx.lineTo(x + SXW - 12, SY - 5);
        ctx.stroke();
      }
    });

    /* ---- the price chart: real price action ---- */
    ctx.strokeStyle = "rgba(110,125,150,0.28)";
    ctx.lineWidth = 1;
    ctx.strokeRect(CX0, CY0, CX1 - CX0, CY1 - CY0);
    mono("HUNTING: " + cur.sector, CX0, CY0 - 8, CU_HI, 9.5, 600);
    mono(
      "ML P(+) " + cur.p.toFixed(2),
      CX1,
      CY0 - 8,
      cur.p >= GATE ? ML : "#B07070",
      8.5,
      600,
      "right",
    );
    // fair value above price, and price vs FV — the Micron grammar
    const fvY = CY0 + (CY1 - CY0) * 0.14;
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "rgba(168,137,78,0.7)";
    ctx.beginPath();
    ctx.moveTo(CX0, fvY);
    ctx.lineTo(CX1, fvY);
    ctx.stroke();
    ctx.setLineDash([]);
    mono("FV", CX1 - 6, fvY - 5, "#A8894E", 7.5, 600, "right");
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = "rgba(148,160,180,0.3)";
    ctx.beginPath();
    ctx.moveTo(CX0, cur.meanY);
    ctx.lineTo(CX1, cur.meanY);
    ctx.stroke();
    ctx.setLineDash([]);
    const lastV = cur.px[cur.px.length - 1];
    const vsFV = -((lastV - fvY) / ((CY1 - CY0) * 0.86)) * 1.0;
    mono(
      "PRICE VS FV " + (vsFV * 100).toFixed(0) + "%",
      (CX0 + CX1) / 2,
      CY0 + 16,
      vsFV < -0.28 ? CU_HI : "#5E6B80",
      8.5,
      vsFV < -0.28 ? 600 : 400,
      "center",
    );
    // price line
    ctx.beginPath();
    cur.px.forEach((v, k) => {
      const x = CX0 + (CX1 - CX0) * (k / 169);
      if (k) ctx.lineTo(x, v);
      else ctx.moveTo(x, v);
    });
    ctx.save();
    ctx.shadowColor = "#D7DEE9";
    ctx.shadowBlur = 3;
    ctx.strokeStyle = "#C6CEDA";
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
    // event bolt during the gap-down
    if (phase === "EVENT" || (cur.dropped && t - phaseT < 700 && phase === "VERDICT")) {
      const hx = CX0 + (CX1 - CX0) * ((cur.px.length - 1) / 169);
      ctx.save();
      ctx.shadowColor = EV_HI;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = EV_HI;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(hx + 8, CY0 + 10);
      ctx.lineTo(hx - 5, CY0 + 44);
      ctx.lineTo(hx + 4, CY0 + 47);
      ctx.lineTo(hx - 7, CY0 + 82);
      ctx.stroke();
      ctx.restore();
      mono("EVENT", hx - 14, CY0 + 22, EV_HI, 8, 600, "right");
    }
    // BUY flash at the dislocation
    if (cur.verdict && cur.verdict.buy) {
      const a = 0.55 + 0.45 * Math.sin(t * 0.02);
      ctx.save();
      ctx.shadowColor = CU_HI;
      ctx.shadowBlur = 12;
      ctx.fillStyle = "rgba(239,192,143," + a + ")";
      ctx.beginPath();
      ctx.moveTo(cur.buyX, cur.buyY + 10);
      ctx.lineTo(cur.buyX - 8, cur.buyY + 24);
      ctx.lineTo(cur.buyX + 8, cur.buyY + 24);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      mono("BUY", cur.buyX, cur.buyY + 38, "rgba(239,192,143," + a + ")", 11, 600, "center");
      mono(
        "−" +
          (30 + Math.floor(rand() * 8)) +
          "% VS FV · UNCOVERED ✓ · ML " +
          cur.p.toFixed(2) +
          " ✓",
        cur.buyX,
        cur.buyY + 52,
        CU,
        7.5,
        500,
        "center",
      );
    } else if (cur.verdict) {
      mono(cur.verdict.txt, (CX0 + CX1) / 2, CY1 - 14, cur.verdict.col, 9, 600, "center");
    }

    /* ---- the book, tethered to the pan ---- */
    mono("BOOK · TETHERED", BKX, 20, "#5E6B80", 10, 500);
    book.forEach((b, i) => {
      const y = 40 + i * 46;
      ctx.strokeStyle = "rgba(239,192,143,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(BKX, y + 16);
      ctx.bezierCurveTo(BKX - 120, y + 16, rx + 70, ry + 9, rx, ry + 11);
      ctx.stroke();
      const fl = Math.max(0, 1 - (t - b.addT) / 1100);
      ctx.fillStyle = "#0A1120";
      ctx.strokeStyle = fl > 0 ? CU_HI : "#22304A";
      ctx.lineWidth = 1 + 1.2 * fl;
      if (fl > 0) {
        ctx.save();
        ctx.shadowColor = CU_HI;
        ctx.shadowBlur = 14 * fl;
      }
      ctx.beginPath();
      ctx.roundRect(BKX, y, 200, 38, 5);
      ctx.fill();
      ctx.stroke();
      if (fl > 0) ctx.restore();
      mono(b.sector, BKX + 10, y + 15, CU_HI, 9, 600);
      mono(
        "entry " + (b.entry * 100).toFixed(0) + "% → now " + (b.now * 100).toFixed(0) + "% vs FV",
        BKX + 10,
        y + 30,
        "#5E6B80",
        7,
        400,
      );
      const sx = BKX + 118,
        sw = 74,
        sy0 = y + 16,
        sh = 14;
      const s0 = b.spark[0];
      ctx.beginPath();
      b.spark.forEach((v, k) => {
        const x = sx + (sw * k) / 25;
        const yy = sy0 - ((v - s0) / 22) * sh;
        if (k) ctx.lineTo(x, yy);
        else ctx.moveTo(x, yy);
      });
      ctx.strokeStyle = "rgba(239,192,143,0.7)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });

    if (!REDUCED) raf = requestAnimationFrame(draw);
  }
  // Paint the first frame synchronously: hidden/throttled tabs suspend rAF,
  // and the card should never sit blank. draw() schedules the loop itself.
  draw(performance.now());
  return () => cancelAnimationFrame(raf);
}

export function StateraSignature({
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
      name="Statera"
      greek="the balance"
      chipLabel={chipLabel}
      chipLive={chipLive}
      cardBackground="#0C1322"
      stats={stats}
      caption="the scanner hunts sector to sector · an event sends the price down on the chart · the BUY flashes at the dislocation, admitted only if the sector diversifies and ML passes · "
      phCaption="[PH] prices, events, sectors, and probabilities simulated; no holdings shown"
      setup={setup}
    />
  );
}
