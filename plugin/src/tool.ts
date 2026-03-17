import type { AnyAgentTool, OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk";
import {
  getCompanySectionFieldNames,
  isCompanySection,
  COMPANY_METADATA,
  COMPANY_SECTIONS,
  type FieldDescriptor,
  type CompanyStateManager,
  type CompanySection,
  type Decision,
} from "./state-machine.js";
import type { TelegramConfig } from "./config.js";
import { sendDecisionToHuman } from "./telegram/send.js";
import type { TelegramRetryQueue } from "./telegram/retry.js";

type JsonSchema = Record<string, unknown>;

// Meta fields agents are allowed to update (the rest is spawn-controlled)
const META_WRITABLE_FIELDS = ["first_boot_complete", "dashboard_url"];

function json(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

function createFieldSchema(descriptor: FieldDescriptor): JsonSchema {
  switch (descriptor.kind) {
    case "string":
      return { type: "string", description: descriptor.description };
    case "number":
      return { type: "number", minimum: descriptor.minimum, maximum: descriptor.maximum, description: descriptor.description };
    case "integer":
      return { type: "integer", minimum: descriptor.minimum, maximum: descriptor.maximum, description: descriptor.description };
    case "string-array":
      return { type: "array", items: { type: "string" }, description: descriptor.description };
    case "nullable-number":
      return {
        anyOf: [
          { type: "number", minimum: descriptor.minimum, maximum: descriptor.maximum },
          { type: "null" },
        ],
        description: descriptor.description,
      };
  }
}

function createGetSchema(): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["action"],
    properties: {
      action: { const: "get" },
      section: {
        type: "string",
        enum: [...COMPANY_SECTIONS],
        description: "Optional section to fetch. Omit to return the full dashboard.",
      },
    },
  };
}

function createUpdateSchema(section: CompanySection): JsonSchema {
  const descriptor = COMPANY_METADATA[section];
  const properties: Record<string, unknown> = {
    action: { const: "update" },
    section: { const: section },
  };

  for (const [fieldName, field] of Object.entries(descriptor.fields)) {
    properties[fieldName] = createFieldSchema(field);
  }

  return {
    type: "object",
    additionalProperties: false,
    required: ["action", "section"],
    properties,
  };
}

function createAddDecisionSchema(): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["action", "summary", "source"],
    properties: {
      action: { const: "add_decision" },
      id: { type: "string", description: "Optional decision identifier. Auto-generated if omitted." },
      summary: { type: "string", description: "One-line summary of the decision." },
      source: { type: "string", description: "Who originated this decision (e.g. VP Product)." },
      requires_human: { type: "boolean", description: "Whether this requires human approval." },
    },
  };
}

function createResolveDecisionSchema(): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["action", "id", "status"],
    properties: {
      action: { const: "resolve_decision" },
      id: { type: "string", description: "Decision ID to resolve." },
      status: { type: "string", enum: ["approved", "rejected"], description: "Resolution status." },
      decided_by: { type: "string", description: "Who resolved (CEO or Human). Defaults to CEO." },
    },
  };
}

const CompanyToolSchema: JsonSchema = {
  anyOf: [
    createGetSchema(),
    ...COMPANY_SECTIONS.map((s) => createUpdateSchema(s)),
    createAddDecisionSchema(),
    createResolveDecisionSchema(),
  ],
};

function extractSectionUpdates(section: CompanySection, params: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const fieldName of getCompanySectionFieldNames(section)) {
    if (params[fieldName] !== undefined) updates[fieldName] = params[fieldName];
  }
  return updates;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; details: unknown };

function handleAddDecision(
  payload: Record<string, unknown>,
  manager: CompanyStateManager,
  telegram?: TelegramConfig,
  retryQueue?: TelegramRetryQueue,
): ToolResult | Promise<ToolResult> {
  const id = typeof payload.id === "string" && payload.id.trim() ? payload.id.trim() : undefined;
  const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  const source = typeof payload.source === "string" ? payload.source.trim() : "";
  if (!summary || !source) {
    return json({ error: "summary and source are required for add_decision." });
  }
  const requiresHuman = typeof payload.requires_human === "boolean" ? payload.requires_human : false;
  let decision: Decision;
  try {
    decision = manager.addDecision({ id, summary, source, requires_human: requiresHuman });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) });
  }

  // Only go async if we actually need to send to Telegram
  if (requiresHuman && telegram?.botToken && telegram.humanChatId) {
    return sendDecisionToHuman(telegram.botToken, telegram.humanChatId, decision).then(
      (result) => {
        if (!result.ok) {
          // Enqueue for retry if retry queue is available
          if (retryQueue) {
            retryQueue.enqueue(decision);
            return json({ decision, telegram_error: result.error, retry_queued: true });
          }
          return json({ decision, telegram_error: result.error });
        }
        return json({ decision, telegram_sent: true });
      },
    );
  }
  return json({ decision });
}

export interface CompanyToolOptions {
  telegram?: TelegramConfig;
  retryQueue?: TelegramRetryQueue;
}

export function registerCompanyTool(api: OpenClawPluginApi, manager: CompanyStateManager, options?: CompanyToolOptions): void {
  const telegram = options?.telegram;

  api.registerTool((_context: OpenClawPluginToolContext): AnyAgentTool => {
    return {
      name: "company",
      label: "Company Dashboard",
      description: "Read or update the corporate state dashboard. Actions: get, update, add_decision, resolve_decision.",
      parameters: CompanyToolSchema,
      execute(_toolCallId: string, params: unknown) {
        const payload =
          params && typeof params === "object" && !Array.isArray(params)
            ? (params as Record<string, unknown>)
            : {};

        if (payload.action === "update") {
          const sectionValue = typeof payload.section === "string" ? payload.section.trim().toLowerCase() : "";
          if (!isCompanySection(sectionValue)) {
            return json({ error: "A valid section is required for update." });
          }
          let updates = extractSectionUpdates(sectionValue, payload);
          // Meta is mostly spawn-controlled — only allow specific fields to be updated by agents
          if (sectionValue === "meta") {
            const allowed: Record<string, unknown> = {};
            for (const key of META_WRITABLE_FIELDS) {
              if (updates[key] !== undefined) allowed[key] = updates[key];
            }
            updates = allowed;
          }
          if (Object.keys(updates).length === 0) {
            return json({ error: `No writable fields provided for ${sectionValue} update.` });
          }
          return json(manager.updateSection(sectionValue, updates as never));
        }

        if (payload.action === "get") {
          const sectionValue =
            typeof payload.section === "string" ? payload.section.trim().toLowerCase() : undefined;
          if (sectionValue !== undefined && !isCompanySection(sectionValue)) {
            return json({ error: "Unknown section requested." });
          }
          return sectionValue ? json(manager.getSection(sectionValue)) : json(manager.getState());
        }

        if (payload.action === "add_decision") {
          return handleAddDecision(payload, manager, telegram, options?.retryQueue);
        }

        if (payload.action === "resolve_decision") {
          const id = typeof payload.id === "string" ? payload.id.trim() : "";
          const statusRaw = typeof payload.status === "string" ? payload.status.trim() : "";
          if (!id || (statusRaw !== "approved" && statusRaw !== "rejected")) {
            return json({ error: "id and status (approved|rejected) are required for resolve_decision." });
          }
          const decidedBy = typeof payload.decided_by === "string" ? payload.decided_by.trim() : "CEO";
          const resolved = manager.resolveDecision(id, statusRaw, decidedBy);
          if (!resolved) {
            return json({ error: `Decision not found: ${id}` });
          }
          return json({ decision: resolved });
        }

        return json({ error: "Unsupported action. Use get, update, add_decision, or resolve_decision." });
      },
    };
  }, { optional: true });
}
