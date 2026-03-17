import type { Decision, CompanyStateManager } from "../state-machine.js";
import { sendDecisionToHuman } from "./send.js";

interface RetryEntry {
  decision: Decision;
  attempts: number;
  nextAttemptAt: number;
}

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 2000;

export class TelegramRetryQueue {
  private queue: RetryEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private botToken: string,
    private humanChatId: string,
    private manager: CompanyStateManager,
  ) {}

  public enqueue(decision: Decision): void {
    // Don't double-enqueue
    if (this.queue.some((e) => e.decision.id === decision.id)) return;
    this.queue.push({
      decision,
      attempts: 0,
      nextAttemptAt: Date.now() + BASE_DELAY_MS,
    });
    this.ensureTimer();
  }

  public async flush(): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    const now = Date.now();
    const remaining: RetryEntry[] = [];

    for (const entry of this.queue) {
      if (entry.nextAttemptAt > now) {
        remaining.push(entry);
        continue;
      }

      entry.attempts++;
      const result = await sendDecisionToHuman(this.botToken, this.humanChatId, entry.decision);

      if (result.ok) {
        sent++;
        // Mark as delivered on the decision in state
        this.markDelivered(entry.decision.id);
      } else if (entry.attempts >= MAX_ATTEMPTS) {
        failed++;
        // Give up — decision stays in queue but won't be retried
      } else {
        // Exponential backoff
        entry.nextAttemptAt = now + BASE_DELAY_MS * Math.pow(2, entry.attempts);
        remaining.push(entry);
      }
    }

    this.queue = remaining;
    if (this.queue.length === 0) this.stopTimer();
    return { sent, failed };
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  public stop(): void {
    this.stopTimer();
  }

  private markDelivered(decisionId: string): void {
    const queue = this.manager.getSection("queue");
    const idx = queue.decisions.findIndex((d) => d.id === decisionId);
    if (idx === -1) return;
    const decisions = [...queue.decisions];
    decisions[idx] = { ...decisions[idx], telegram_delivered: true };
    this.manager.updateSection("queue", { decisions } as never);
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush().catch(() => {});
    }, BASE_DELAY_MS);
    // Don't keep the process alive just for retries
    if (typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
