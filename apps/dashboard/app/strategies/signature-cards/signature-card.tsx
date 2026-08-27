"use client";

// Shared chrome for the five approved signature canvases: header row
// (NAME / greek / italic tag / right-aligned pinned stats / book chip), the
// 2200x860 panorama canvas, and the mono footer caption with its [PH]
// placeholder span — reproduced from the owner's standalone HTML files.
//
// The draw script itself lives in each sleeve component as a `setup` function
// (transplanted verbatim from the source file); this wrapper only mounts it
// inside an effect so the Worker SSR renders the chrome with an empty canvas
// and never executes any canvas code. The setup returns its cleanup (rAF
// cancellation), which runs on unmount.

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./signature-cards.module.css";

/** Mounts one transplanted draw script on the canvas; returns its cleanup. */
export type SignatureSetup = (canvas: HTMLCanvasElement) => () => void;

/** Pre-formatted pinned backtest stats (null while loading / unavailable). */
export interface SignatureStats {
  cagr: string;
  sharpe: string;
}

export function SignatureCard({
  name,
  greek,
  tag,
  chipLabel,
  chipLive,
  cardBackground,
  stats,
  caption,
  phCaption,
  setup,
}: {
  name: string;
  greek: string;
  tag?: string;
  /** Runtime-resolved book label (resolveBookType), or the file's fallback. */
  chipLabel: string;
  chipLive: boolean;
  /** The source file's --card value (#0C1322, kairos #0A1020). */
  cardBackground: string;
  stats: SignatureStats | null;
  /** Footer caption, verbatim from the source file. */
  caption: string;
  /** The [PH]-colored tail of the footer caption, verbatim. */
  phCaption: string;
  setup: SignatureSetup;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return setup(canvas);
  }, [setup]);

  return (
    <section className={styles.card} style={{ background: cardBackground }}>
      <div className={styles.head}>
        <span className={styles.name}>{name}</span>
        <span className={styles.greek}>{greek}</span>
        {tag ? <span className={styles.tag}>{tag}</span> : null}
        <span className={styles.stats}>
          CAGR {stats ? stats.cagr : "—"} ·{" "}
          <span className={styles.statsSharpe}>Sharpe {stats ? stats.sharpe : "—"}</span>
        </span>
        <span className={chipLive ? `${styles.chip} ${styles.chipLive}` : styles.chip}>
          {chipLabel}
        </span>
      </div>
      <canvas ref={canvasRef} width={2200} height={860} className={styles.canvas} />
      <div className={styles.foot}>
        {caption}
        <span className={styles.ph}>{phCaption}</span>
      </div>
    </section>
  );
}
