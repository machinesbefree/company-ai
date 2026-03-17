import fs from "node:fs/promises";
import path from "node:path";
import { createDefaultCompanyState, normalizeCompanyState, type CompanyState } from "./state-machine.js";

interface PersistenceLogger {
  error: (message: string) => void;
}

export class StatePersistence {
  private readonly stateDir: string;
  private readonly logger?: PersistenceLogger;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(stateDir: string, logger?: PersistenceLogger) {
    this.stateDir = stateDir;
    this.logger = logger;
  }

  public async initialize(): Promise<void> {
    await fs.mkdir(this.stateDir, { recursive: true });
  }

  public async loadState(): Promise<CompanyState> {
    const filePath = path.join(this.stateDir, "state.json");

    try {
      const raw = await fs.readFile(filePath, "utf8");
      return normalizeCompanyState(JSON.parse(raw));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        this.logger?.error(`[company] Failed to load state from disk: ${message}`);
      }
      return createDefaultCompanyState();
    }
  }

  public saveState(state: CompanyState): Promise<void> {
    const snapshot = normalizeCompanyState(state);
    this.writeChain = this.writeChain
      .catch((error) => {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        this.logger?.error(`[company] Previous write failed: ${message}`);
      })
      .then(() => this.writeSnapshot(snapshot));

    return this.writeChain;
  }

  private async writeSnapshot(state: CompanyState): Promise<void> {
    const filePath = path.join(this.stateDir, "state.json");
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

    await fs.mkdir(this.stateDir, { recursive: true });
    await fs.writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await fs.rename(tmpPath, filePath);
  }
}
