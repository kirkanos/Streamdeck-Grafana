/**
 * Runs the periodic panel renders of all keys and dials.
 *
 * Each key has one job with its own interval. A job never runs twice at the
 * same time: a refresh requested while it runs is folded into one rerun right
 * after. Across jobs, at most `maxConcurrent` renders are in flight, and the
 * first runs of jobs that start together are staggered, so a page full of
 * panels does not hit Grafana all at once. Intervals count from the end of a
 * run, so slow renders cannot pile up.
 */
export type SchedulerOptions = {
  /** Renders in flight at the same time across all jobs. */
  maxConcurrent?: number;
  /** Delay between the first runs of jobs started together. */
  staggerMs?: number;
};

type Job = {
  intervalMs: number;
  timer?: ReturnType<typeof setTimeout>;
  queued: boolean;
  running: boolean;
  rerun: boolean;
};

export class RefreshScheduler {
  readonly #run: (id: string) => Promise<void>;
  readonly #maxConcurrent: number;
  readonly #staggerMs: number;
  readonly #jobs = new Map<string, Job>();
  readonly #queue: string[] = [];
  #running = 0;
  /** Jobs waiting for their staggered first run; decides the delay of the next one. */
  #pendingStarts = 0;

  constructor(run: (id: string) => Promise<void>, options: SchedulerOptions = {}) {
    this.#run = run;
    this.#maxConcurrent = Math.max(1, options.maxConcurrent ?? 2);
    this.#staggerMs = Math.max(0, options.staggerMs ?? 400);
  }

  has(id: string): boolean {
    return this.#jobs.has(id);
  }

  /**
   * Starts a job (first run staggered) or, for a known job, applies the new
   * interval and refreshes right away.
   */
  start(id: string, intervalMs: number): void {
    const existing = this.#jobs.get(id);
    if (existing) {
      existing.intervalMs = intervalMs;
      this.refresh(id);
      return;
    }
    const job: Job = { intervalMs, queued: false, running: false, rerun: false };
    this.#jobs.set(id, job);
    const delay = Math.min(this.#pendingStarts, 10) * this.#staggerMs;
    this.#pendingStarts++;
    job.timer = setTimeout(() => {
      job.timer = undefined;
      this.#pendingStarts--;
      this.#enqueue(id, job);
    }, delay);
  }

  /** Runs the job as soon as possible; folded into the current run if one is in flight. */
  refresh(id: string): void {
    const job = this.#jobs.get(id);
    if (!job) {
      return;
    }
    if (job.running) {
      job.rerun = true;
      return;
    }
    if (job.timer) {
      clearTimeout(job.timer);
      job.timer = undefined;
      if (this.#pendingStarts > 0) {
        this.#pendingStarts--;
      }
    }
    this.#enqueue(id, job);
  }

  /** Stops a job; a run in flight finishes but is not repeated. */
  stop(id: string): void {
    const job = this.#jobs.get(id);
    if (!job) {
      return;
    }
    if (job.timer) {
      clearTimeout(job.timer);
    }
    const index = this.#queue.indexOf(id);
    if (index >= 0) {
      this.#queue.splice(index, 1);
    }
    this.#jobs.delete(id);
  }

  #enqueue(id: string, job: Job): void {
    if (job.queued) {
      return;
    }
    job.queued = true;
    this.#queue.push(id);
    this.#drain();
  }

  #drain(): void {
    while (this.#running < this.#maxConcurrent && this.#queue.length > 0) {
      const id = this.#queue.shift()!;
      const job = this.#jobs.get(id);
      if (!job) {
        continue;
      }
      job.queued = false;
      job.running = true;
      job.rerun = false;
      this.#running++;
      this.#run(id)
        .catch(() => undefined)
        .then(() => {
          this.#running--;
          job.running = false;
          if (this.#jobs.get(id) === job) {
            if (job.rerun) {
              this.#enqueue(id, job);
            } else {
              job.timer = setTimeout(() => {
                job.timer = undefined;
                this.#enqueue(id, job);
              }, job.intervalMs);
            }
          }
          this.#drain();
        });
    }
  }
}
