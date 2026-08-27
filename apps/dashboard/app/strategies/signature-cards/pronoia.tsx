"use client";

// Pronoia — "neural v1" signature, transplanted verbatim from the approved
// akribeia_pronoia_neural_v1.html. Seeds, timings, palette, re-rank cycle,
// easing and text calls are the author's. Mechanical adaptations only:
// canvas via ref, rAF handle captured and cancelled on unmount, REDUCED read
// inside the effect (reduced motion draws exactly one static frame),
// setTransform reset before the authored ctx.scale, and minimal TypeScript
// typing (universe/transit/held interfaces; held rows' targetY gets a
// behavior-neutral zero initializer — rerank assigns it before any read).

import { SignatureCard, type SignatureStats } from "./signature-card";

interface Uni {
  x: number;
  y: number;
  feat: number;
  fbias: number;
  retJit: number;
  tracked: boolean;
  score: number;
  disp: number;
}
interface Transit {
  u: Uni;
  t0: number;
  dur: number;
}
interface HeldRow {
  u: Uni;
  y: number;
  ret: number;
  wig: number;
  targetY: number;
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

  const CYAN = "#38B6E0",
    CYAN_HI = "#9FE6FF",
    FIELD = "#5F6FA8";
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
  const sm = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));

  /* zones */
  const UX0 = 26,
    UX1 = 236,
    UY0 = 40,
    UY1 = H - 34;
  const MX = 352,
    MW = 120;
  const RX = 548;
  const PX0 = 620,
    PX1 = 950;
  const SXc = 986;
  const RY0 = 44,
    RY1 = H - 52;

  /* universe: 120 stocks; tracked subsample of 26 on the rank axis */
  const NU = 120,
    NT = 26;
  const uni: Uni[] = [];
  for (let i = 0; i < NU; i++) {
    uni.push({
      x: UX0 + 8 + rand() * (UX1 - UX0 - 16),
      y: UY0 + 8 + rand() * (UY1 - UY0 - 16),
      feat: rand(),
      fbias: i < 26 ? 0.12 + rand() * 0.78 : 0.35 + rand() * 0.4,
      retJit: rand() * 0.16,
      tracked: i < NT,
      score: rand() * 0.7 + 0.15,
      disp: 0,
    });
  }
  uni.forEach((u) => (u.disp = u.score));
  const yOfScore = (s: number) => RY1 - (RY1 - RY0) * s;

  /* model glyph */
  const glyph = [
    [0, 1, 2, 3, 4, 5],
    [0, 1, 2, 3],
    [0, 1, 2],
  ].map((L, li) =>
    L.map((_, ni) => ({
      x: MX - MW / 2 + li * (MW / 2),
      y: H / 2 + (ni - (L.length - 1) / 2) * 30,
      a: rand(),
    })),
  );

  /* transit particles */
  const transits: Transit[] = [];
  function spawnTransit(t: number) {
    const u = uni[Math.floor(rand() * NU)];
    transits.push({ u, t0: t, dur: 1500 + rand() * 400 });
  }
  function transitPos(tr: Transit, t: number) {
    const p = (t - tr.t0) / tr.dur;
    if (p >= 1) return null;
    const u = tr.u;
    if (p < 0.5) {
      const q = sm(p / 0.5);
      return [u.x + (MX - MW / 2 - u.x) * q, u.y + (H / 2 - u.y) * q];
    } else {
      const q = sm((p - 0.5) / 0.5);
      const ty = yOfScore(u.score);
      return [MX + MW / 2 + (RX - (MX + MW / 2)) * q, H / 2 + (ty - H / 2) * q];
    }
  }

  /* re-rank cycle */
  const REB = 12000,
    TRANS = 1300;
  let cycle = 87,
    lastCycle = -1,
    transT = -1e9;
  let held: HeldRow[] = [],
    oldHeld: HeldRow[] = [];
  function rerank(t: number) {
    const ranked = uni
      .filter((u) => u.tracked)
      .slice()
      .sort((a, b) => b.score - a.score);
    oldHeld = held;
    held = ranked.slice(0, 5).map((u) => ({
      u,
      y: yOfScore(u.score),
      ret: 0.06 + u.score * 0.22 + u.retJit,
      wig: rand() * 10,
      targetY: 0,
    }));
    held
      .sort((a, b) => b.ret - a.ret)
      .forEach((h, i) => {
        h.targetY = RY0 + 18 + i * 36;
      });
    transT = t;
    cycle++;
  }

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

  const T0 = performance.now();
  let lastSpawn = 0;
  rerank(0);

  let raf = 0;
  function draw(now: number) {
    const t = now - T0;
    const cyc = Math.floor(t / REB);
    const cp = (t % REB) / REB;
    if (cyc !== lastCycle) {
      if (lastCycle >= 0) rerank(t);
      lastCycle = cyc;
    }
    const trans = Math.min(1, (t - transT) / TRANS);
    const evFlash = trans < 1 ? 1 - trans : 0;

    /* continuous universe + scoring drift */
    uni.forEach((u) => {
      u.feat += (u.fbias - u.feat) * 0.02 + (rand() * 2 - 1) * 0.02;
      if (u.feat < 0) u.feat = 0;
      if (u.feat > 1) u.feat = 1;
      const target = 0.15 + 0.7 * (0.35 * u.feat + 0.65 * u.fbias) + (rand() * 2 - 1) * 0.01;
      u.score += (target - u.score) * 0.012;
      if (u.score < 0.02) u.score = 0.02;
      if (u.score > 0.98) u.score = 0.98;
      u.disp += (u.score - u.disp) * 0.06;
    });
    if (t - lastSpawn > 130) {
      spawnTransit(t);
      lastSpawn = t;
    }
    for (let i = transits.length - 1; i >= 0; i--)
      if (t - transits[i].t0 > transits[i].dur) transits.splice(i, 1);

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0, W, H);

    /* STAGE 1 · streaming universe */
    mono("UNIVERSE ×1,412 · STREAMING", UX0, 20, "#5E6B80", 10, 500);
    uni.forEach((u) => {
      ctx.globalAlpha = 0.35 + 0.55 * u.feat;
      ctx.fillStyle = u.tracked ? FIELD : "#48547E";
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.tracked ? 2.6 : 2.0, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    /* STAGE 2 · the model, always scoring */
    mono("MODEL · 12M FORWARD · SCORING", MX - MW / 2, 20, "#5E6B80", 10, 500);
    for (let l = 0; l < 2; l++)
      for (const a of glyph[l])
        for (const b of glyph[l + 1]) {
          ctx.strokeStyle = "rgba(56,182,224,0.18)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
    glyph.flat().forEach((n) => {
      n.a += (0.3 + 0.6 * Math.abs(Math.sin(t * 0.001 + n.x + n.y)) - n.a) * 0.1;
      ctx.fillStyle = "#0A1120";
      ctx.beginPath();
      ctx.arc(n.x, n.y, 5.5, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 0.25 + 0.75 * n.a;
      ctx.fillStyle = CYAN;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 3.4, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 5.5, 0, 7);
      ctx.stroke();
    });
    transits.forEach((tr) => {
      const pos = transitPos(tr, t);
      if (!pos) return;
      ctx.save();
      ctx.shadowColor = CYAN;
      ctx.shadowBlur = 8;
      ctx.fillStyle = CYAN;
      ctx.beginPath();
      ctx.arc(pos[0], pos[1], 1.9, 0, 7);
      ctx.fill();
      ctx.restore();
    });

    /* rank axis */
    mono("RANK", RX, 20, "#5E6B80", 10, 500, "center");
    ctx.strokeStyle = "rgba(110,125,150,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(RX, RY0 - 6);
    ctx.lineTo(RX, RY1 + 6);
    ctx.stroke();
    const heldSet = new Set(held.map((h) => h.u));
    uni
      .filter((u) => u.tracked)
      .forEach((u, idx) => {
        const y = yOfScore(u.disp);
        const isHeld = heldSet.has(u);
        const rx = RX + (idx % 2 ? 3 : -3);
        ctx.save();
        if (isHeld) {
          ctx.shadowColor = CYAN_HI;
          ctx.shadowBlur = 10;
        }
        ctx.fillStyle = isHeld ? CYAN_HI : FIELD;
        ctx.beginPath();
        ctx.arc(isHeld ? RX : rx, y, isHeld ? 3.6 : 2.4, 0, 7);
        ctx.fill();
        ctx.restore();
      });
    if (held.length) {
      const cutY = Math.max(...held.map((h) => yOfScore(h.u.score)));
      ctx.strokeStyle = "rgba(159,230,255," + (0.35 + 0.5 * evFlash) + ")";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(RX - 14, cutY + 8);
      ctx.lineTo(RX + 14, cutY + 8);
      ctx.stroke();
      ctx.setLineDash([]);
      mono("TOP 5", RX - 18, cutY + 11, "#5E6B80", 8, 500, "right");
    }

    /* STAGE 3 · held projection */
    mono("FORECAST · HELD", PX0, 20, "#5E6B80", 10, 500);
    mono(
      "NEXT RE-RANK " + Math.round(cp * 100) + "%",
      W - 6,
      20,
      evFlash > 0 ? "#9FE6FF" : "#3E4C64",
      8.5,
      evFlash > 0 ? 600 : 400,
      "right",
    );
    if (evFlash > 0)
      mono(
        "RE-RANK",
        W - 6,
        34,
        "rgba(159,230,255," + (0.4 + 0.6 * evFlash) + ")",
        9,
        600,
        "right",
      );
    ctx.strokeStyle = "rgba(215,222,233,0.35)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(PX0, RY0 - 6);
    ctx.lineTo(PX0, RY1 + 6);
    ctx.stroke();
    mono("NOW", PX0, RY1 + 22, "#5E6B80", 8.5, 500, "center");
    mono("+12M", PX1, RY1 + 22, "#5E6B80", 8.5, 500, "center");
    ctx.strokeStyle = "rgba(110,125,150,0.15)";
    ctx.beginPath();
    ctx.moveTo(PX1, RY0 - 6);
    ctx.lineTo(PX1, RY1 + 6);
    ctx.stroke();

    function fan(list: HeldRow[], alpha: number, progress: number) {
      list.forEach((h) => {
        const y0 = h.y;
        const y1 = h.targetY;
        const steps = 40,
          upto = Math.max(2, Math.floor(steps * progress));
        // confidence cone
        ctx.beginPath();
        for (let k = 0; k <= upto; k++) {
          const q = k / steps,
            x = PX0 + (PX1 - PX0) * q;
          const y = y0 + (y1 - y0) * q;
          if (k) ctx.lineTo(x, y - 14 * q);
          else ctx.moveTo(x, y - 14 * q);
        }
        for (let k = upto; k >= 0; k--) {
          const q = k / steps,
            x = PX0 + (PX1 - PX0) * q;
          ctx.lineTo(x, y0 + (y1 - y0) * q + 14 * q);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(56,182,224," + 0.1 * alpha + ")";
        ctx.fill();
        // center path
        ctx.beginPath();
        for (let k = 0; k <= upto; k++) {
          const q = k / steps,
            x = PX0 + (PX1 - PX0) * q;
          const y = y0 + (y1 - y0) * q + Math.sin(q * 6 + h.wig) * 3 * (1 - q);
          if (k) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.save();
        ctx.shadowColor = "#38B6E0";
        ctx.shadowBlur = 7 * alpha;
        ctx.strokeStyle = "rgba(56,182,224," + 0.85 * alpha + ")";
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.restore();
        if (progress >= 1 && alpha > 0.9) {
          const ex = PX1,
            ey = y1;
          ctx.save();
          ctx.shadowColor = CYAN_HI;
          ctx.shadowBlur = 8;
          ctx.fillStyle = CYAN_HI;
          ctx.beginPath();
          ctx.arc(ex, ey, 3, 0, 7);
          ctx.fill();
          ctx.restore();
          mono("+" + (h.ret * 100).toFixed(1) + "%", ex - 6, ey - 8, "#9FE6FF", 9, 500, "right");
        }
      });
    }
    if (trans < 1 && oldHeld.length) fan(oldHeld, 1 - trans, 1);
    fan(held, trans < 1 ? trans : 1, trans < 1 ? trans : 1);
    held.forEach((h) => {
      ctx.strokeStyle = "rgba(159,230,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(RX + 4, yOfScore(h.u.score));
      ctx.lineTo(PX0 - 2, h.y);
      ctx.stroke();
    });

    /* slots — rank + forecast only */
    mono("SUGGESTED BOOK", SXc, 54, "#5E6B80", 9.5, 500);
    mono("TOP 5 · HELD TO RE-RANK", SXc, 67, "#3E4C64", 8, 400);
    held
      .slice()
      .sort((a, b) => b.ret - a.ret)
      .forEach((h, i) => {
        const y = 80 + i * 58;
        ctx.fillStyle = "#0A1120";
        ctx.strokeStyle = evFlash > 0.1 ? CYAN_HI : "#22304A";
        ctx.lineWidth = 1 + 1.1 * evFlash;
        if (evFlash > 0.1) {
          ctx.save();
          ctx.shadowColor = CYAN_HI;
          ctx.shadowBlur = 14 * evFlash;
        }
        ctx.beginPath();
        ctx.roundRect(SXc, y, 100, 44, 6);
        ctx.fill();
        ctx.stroke();
        if (evFlash > 0.1) ctx.restore();
        mono("RANK " + (i + 1), SXc + 12, y + 18, "#93A0B4", 10, 600);
        mono("ŷ +" + (h.ret * 100).toFixed(1) + "%", SXc + 12, y + 35, "#9FE6FF", 10.5, 500);
      });

    if (!REDUCED) raf = requestAnimationFrame(draw);
  }
  // Paint the first frame synchronously: hidden/throttled tabs suspend rAF,
  // and the card should never sit blank. draw() schedules the loop itself.
  draw(performance.now());
  return () => cancelAnimationFrame(raf);
}

export function PronoiaSignature({
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
      name="Pronoia"
      greek="πρόνοια"
      chipLabel={chipLabel}
      chipLive={chipLive}
      cardBackground="#0C1322"
      stats={stats}
      caption="the model scores the whole universe 12 months forward, continuously · the top-5 projection is held, and redraws only at re-rank · "
      phCaption="[PH] universe, scores, and forecasts simulated; no holdings shown"
      setup={setup}
    />
  );
}
