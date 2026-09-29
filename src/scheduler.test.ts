import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshScheduler } from "./scheduler";

describe("RefreshScheduler", () => {
  let runs: string[];
  let finish: Map<string, () => void>;

  /** A run that stays in flight until `done(id)` is called. */
  const run = (id: string) =>
    new Promise<void>((resolve) => {
      runs.push(id);
      finish.set(id, resolve);
    });
  const done = async (id: string) => {
    finish.get(id)?.();
    finish.delete(id);
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    runs = [];
    finish = new Map();
  });
  afterEach(() => vi.useRealTimers());

  it("runs a new job right away and repeats it after the interval, counted from the end of the run", async () => {
    const s = new RefreshScheduler(run, { staggerMs: 0 });
    s.start("a", 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(runs).toEqual(["a"]);
    await done("a");
    await vi.advanceTimersByTimeAsync(999);
    expect(runs).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toEqual(["a", "a"]);
  });

  it("staggers the first runs of jobs that start together", async () => {
    const s = new RefreshScheduler(run, { staggerMs: 500, maxConcurrent: 10 });
    s.start("a", 60_000);
    s.start("b", 60_000);
    s.start("c", 60_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(runs).toEqual(["a", "b"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(runs).toEqual(["a", "b", "c"]);
  });

  it("keeps at most maxConcurrent renders in flight", async () => {
    const s = new RefreshScheduler(run, { staggerMs: 0, maxConcurrent: 2 });
    for (const id of ["a", "b", "c", "d"]) {
      s.start(id, 60_000);
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toEqual(["a", "b"]);
    await done("a");
    expect(runs).toEqual(["a", "b", "c"]);
    await done("b");
    await done("c");
    expect(runs).toEqual(["a", "b", "c", "d"]);
  });

  it("folds refreshes during a run into exactly one rerun", async () => {
    const s = new RefreshScheduler(run, { staggerMs: 0 });
    s.start("a", 60_000);
    await vi.advanceTimersByTimeAsync(0);
    s.refresh("a");
    s.refresh("a");
    s.refresh("a");
    expect(runs).toEqual(["a"]);
    await done("a");
    expect(runs).toEqual(["a", "a"]);
    await done("a");
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toEqual(["a", "a"]);
  });

  it("refreshes an idle job immediately and restarts its interval", async () => {
    const s = new RefreshScheduler(run, { staggerMs: 0 });
    s.start("a", 1000);
    await vi.advanceTimersByTimeAsync(0);
    await done("a");
    await vi.advanceTimersByTimeAsync(700);
    s.refresh("a");
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toEqual(["a", "a"]);
    await done("a");
    await vi.advanceTimersByTimeAsync(999);
    expect(runs).toEqual(["a", "a"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toEqual(["a", "a", "a"]);
  });

  it("applies a new interval to a known job", async () => {
    const s = new RefreshScheduler(run, { staggerMs: 0 });
    s.start("a", 60_000);
    await vi.advanceTimersByTimeAsync(0);
    await done("a");
    s.start("a", 100);
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toEqual(["a", "a"]);
    await done("a");
    await vi.advanceTimersByTimeAsync(100);
    expect(runs).toEqual(["a", "a", "a"]);
  });

  it("stops repeating after stop, even for a run in flight", async () => {
    const s = new RefreshScheduler(run, { staggerMs: 0 });
    s.start("a", 100);
    s.start("b", 100);
    await vi.advanceTimersByTimeAsync(0);
    s.stop("a");
    s.stop("b");
    await done("a");
    await done("b");
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toEqual(["a", "b"]);
    expect(s.has("a")).toBe(false);
  });

  it("drops a queued job that is stopped before it runs", async () => {
    const s = new RefreshScheduler(run, { staggerMs: 0, maxConcurrent: 1 });
    s.start("a", 60_000);
    s.start("b", 60_000);
    await vi.advanceTimersByTimeAsync(0);
    s.stop("b");
    await done("a");
    expect(runs).toEqual(["a"]);
  });

  it("keeps going when a run fails", async () => {
    let calls = 0;
    const s = new RefreshScheduler(
      async () => {
        calls++;
        throw new Error("boom");
      },
      { staggerMs: 0 },
    );
    s.start("a", 100);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(2);
  });
});
