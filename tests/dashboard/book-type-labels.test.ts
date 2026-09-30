// Truth-in-labeling for the three book types (keep-live item 4, 2026-09-30).
//
// "LIVE broker-confirmed" may render ONLY for an entry whose book_type is "live". After
// Bradley stopped trading (2026-09-21) every rebalance banks as "model": what the model
// would hold, no order placed. Before this, every label here was binary live/paper, so a
// model book either collapsed to PAPER (false: the sleeve was real money) or -- at the
// `=== "paper" ? PAPER : LIVE` sites -- reached LIVE by elimination. These tests render
// the real components, so a regression fails on the markup a reader would actually see.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BookTypePill } from "../../apps/dashboard/app/strategies/book-type-pill";
import {
  isBookType,
  resolveBookType,
  type BookType,
} from "../../apps/dashboard/app/strategies/strategy-books";
import {
  scheduleLabel,
  type SleeveSchedule,
} from "../../apps/dashboard/app/strategies/strategy-schedule";

const pill = (bookType: BookType, asOf = "2026-09-30") =>
  renderToStaticMarkup(createElement(BookTypePill, { bookType, asOf }));

const schedule = (rebalance_book_type: string) =>
  ({
    model_label: "first of month",
    rebalance_book_type,
    go_live_pending: false,
    go_live: "2026-05-29",
  }) as unknown as SleeveSchedule;

describe("book-type labels", () => {
  it("renders LIVE broker-confirmed only for a live entry", () => {
    expect(pill("live")).toContain("● LIVE · broker");
    expect(pill("live")).toContain("LIVE — broker-confirmed positions (as of 2026-09-30)");
  });

  it("renders a model book as MODEL and never as LIVE", () => {
    const markup = pill("model");
    expect(markup).toContain("◇ MODEL · no orders");
    expect(markup).toContain("Bradley stopped trading 2026-09-21, no order placed");
    expect(markup).not.toContain("LIVE");
    expect(markup).not.toContain("broker-confirmed");
  });

  it("renders a paper book as PAPER and never as LIVE", () => {
    const markup = pill("paper");
    expect(markup).toContain("◌ PAPER · research");
    expect(markup).not.toContain("LIVE");
  });

  it("resolves model from the status map and from the strategy JSON", () => {
    expect(resolveBookType({ book_type: "model" }, undefined)).toBe("model");
    expect(resolveBookType(undefined, "model")).toBe("model");
    // Unknown or absent still defaults to paper -- never to live.
    expect(resolveBookType(undefined, "held")).toBe("paper");
    expect(resolveBookType(undefined, undefined)).toBe("paper");
    expect(isBookType("model")).toBe(true);
    expect(isBookType("LIVE")).toBe(false);
  });

  it("names a post-stop rebalance model in the schedule label", () => {
    expect(scheduleLabel(schedule("model"))).toBe("first of month · model");
    expect(scheduleLabel(schedule("live"))).toBe("first of month · live");
    expect(scheduleLabel(schedule("paper"))).toBe("first of month · paper");
    expect(scheduleLabel(schedule("anything-else"))).toBe("first of month · paper");
  });
});
