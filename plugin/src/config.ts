import os from "node:os";
import path from "node:path";
import { COMPANY_SECTIONS, isCompanySection, type CompanySection } from "./state-machine.js";

export function resolveUserPath(value: string): string {
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}

export interface AgentConfig {
  enabled: boolean;
  inject: CompanySection[];
}

export interface TelegramConfig {
  botToken: string;
  humanChatId: string;
  secretToken: string;
}

export interface PluginConfig {
  stateDir: string;
  agents: Record<string, AgentConfig>;
  telegram: TelegramConfig;
}

export const DEFAULT_STATE_DIR = resolveUserPath("~/.openclaw/company/");

// Default inject excludes meta — it's opt-in since it's mostly config data
const DEFAULT_INJECT_SECTIONS: CompanySection[] = [
  "ceo", "finance", "operations", "strategy", "personnel", "risks", "queue",
];

function defaultInjectSections(): CompanySection[] {
  return [...DEFAULT_INJECT_SECTIONS];
}

function normalizeInjectSections(value: unknown): CompanySection[] {
  if (!Array.isArray(value)) return defaultInjectSections();

  const sections: CompanySection[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim().toLowerCase();
    if (!isCompanySection(normalized)) continue;
    if (!sections.includes(normalized)) sections.push(normalized);
  }
  return sections;
}

export function parseConfig(raw: unknown): PluginConfig {
  const config: PluginConfig = {
    stateDir: DEFAULT_STATE_DIR,
    agents: {},
    telegram: { botToken: "", humanChatId: "", secretToken: "" },
  };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return config;
  const record = raw as Record<string, unknown>;

  if (typeof record.stateDir === "string") {
    config.stateDir = resolveUserPath(record.stateDir);
  }

  const rawAgents = record.agents;
  if (!rawAgents || typeof rawAgents !== "object" || Array.isArray(rawAgents)) return config;

  for (const [agentId, rawAgentConfig] of Object.entries(rawAgents)) {
    if (!rawAgentConfig || typeof rawAgentConfig !== "object" || Array.isArray(rawAgentConfig)) continue;
    const agentRecord = rawAgentConfig as Record<string, unknown>;
    config.agents[agentId] = {
      enabled: typeof agentRecord.enabled === "boolean" ? agentRecord.enabled : true,
      inject: normalizeInjectSections(agentRecord.inject),
    };
  }

  const rawTelegram = record.telegram;
  if (rawTelegram && typeof rawTelegram === "object" && !Array.isArray(rawTelegram)) {
    const tg = rawTelegram as Record<string, unknown>;
    config.telegram = {
      botToken: typeof tg.botToken === "string" ? tg.botToken : "",
      humanChatId: typeof tg.humanChatId === "string" ? tg.humanChatId : "",
      secretToken: typeof tg.secretToken === "string" ? tg.secretToken : "",
    };
  }

  return config;
}
