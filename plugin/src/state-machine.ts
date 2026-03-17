import crypto from "node:crypto";

export function generateDecisionId(): string {
  return `dec_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

export const COMPANY_SECTIONS = [
  "ceo",
  "finance",
  "operations",
  "strategy",
  "personnel",
  "risks",
  "queue",
  "meta",
] as const;
export const COMPANY_STATE_VERSION = 4;
export const MAX_RESOLVED_KEPT = 50;

export type CompanySection = (typeof COMPANY_SECTIONS)[number];

type FieldKind = "string" | "number" | "integer" | "string-array" | "nullable-number";

export interface FieldDescriptor {
  label: string;
  kind: FieldKind;
  description?: string;
  minimum?: number;
  maximum?: number;
}

export interface SectionDescriptor {
  header: string;
  fields: Record<string, FieldDescriptor>;
}

// --- Section interfaces ---

export interface CeoSection {
  focus: string;
  goals: string[];
  current_priority: string;
  blocked_on: string;
  next_action: string;
  note_to_self: string;
}

export interface FinanceSection {
  runway_months: number;
  monthly_burn: number;
  monthly_revenue: number;
  cash_on_hand: number;
  burn_trend: string;
  next_funding_event: string;
  // Narrative — VP Finance standup
  attention: string;
  report: string;
  needs: string;
  report_file: string;
}

export interface OperationsSection {
  active_projects: string[];
  blocked_projects: string[];
  headcount: number;
  open_roles: number;
  system_health: string;
  incident_summary: string;
  // Narrative — VP Engineering standup
  attention: string;
  report: string;
  needs: string;
  report_file: string;
}

export interface StrategySection {
  current_priorities: string[];
  quarterly_objectives: string[];
  competitive_landscape: string;
  pending_decisions: string[];
  // Narrative — VP Product standup
  attention: string;
  report: string;
  needs: string;
  report_file: string;
}

export interface PersonnelSection {
  org_mood: string;
  attrition_risk: string;
  key_hires_status: string;
  delegation_map: string;
  // Narrative — shared across VPs
  attention: string;
  report: string;
  needs: string;
  report_file: string;
}

export interface RisksSection {
  top_risks: string[];
  mitigations_in_progress: string[];
  risk_level: string;
  last_review: string;
  // Narrative
  attention: string;
  report: string;
  needs: string;
  report_file: string;
}

export interface QueueSection {
  pending_count: number;
  pending_summaries: string[];
  awaiting_human: string[];
  last_decision: string;
  last_decision_by: string;
  // Narrative — CEO's summary of what's in the pipe
  report: string;
  // Structured decisions for inline keyboard callbacks
  decisions: Decision[];
}

// --- Decision & Role types ---

export type DecisionStatus = "pending" | "approved" | "rejected";

export interface Decision {
  id: string;
  summary: string;
  source: string;
  status: DecisionStatus;
  requires_human: boolean;
  created_at: string;
  telegram_message_id?: number;
  telegram_delivered?: boolean;
}

export interface RoleAssignment {
  role: string;
  type: "ai" | "human";
  agentId?: string;
  telegramChatId?: string;
  displayName: string;
}

export interface MetaSection {
  company_name: string;
  domain: string;
  spawned_at: string;
  roles: RoleAssignment[];
  twilio_phone: string;
  voice_enabled: boolean;
  dashboard_url: string;
  context_path: string;
  first_boot_complete: boolean;
}

// --- Aggregate state ---

export type SectionTimestamps = Partial<Record<CompanySection, number>>;

export interface CompanyState {
  version: number;
  lastUpdated: number;
  sectionUpdatedAt: SectionTimestamps;
  ceo: CeoSection;
  finance: FinanceSection;
  operations: OperationsSection;
  strategy: StrategySection;
  personnel: PersonnelSection;
  risks: RisksSection;
  queue: QueueSection;
  meta: MetaSection;
}

type SectionStateMap = {
  ceo: CeoSection;
  finance: FinanceSection;
  operations: OperationsSection;
  strategy: StrategySection;
  personnel: PersonnelSection;
  risks: RisksSection;
  queue: QueueSection;
  meta: MetaSection;
};

// --- Narrative field descriptors (shared pattern) ---

const NARRATIVE_FIELDS: Record<string, FieldDescriptor> = {
  attention: {
    label: "Attention",
    kind: "string",
    description: "VP's self-assessed need for CEO attention: none, low, medium, high, urgent. Set by the VP each update.",
  },
  report: {
    label: "VP Report",
    kind: "string",
    description: "Latest standup report from the owning VP. Brief narrative of status, progress, and blockers.",
  },
  needs: {
    label: "Needs",
    kind: "string",
    description: "What the VP needs from the CEO or human — approvals, decisions, resources.",
  },
  report_file: {
    label: "Detail",
    kind: "string",
    description: "File path to the detailed report in the VP's workspace.",
  },
};

// --- Metadata for tool schema generation and injection formatting ---

export const COMPANY_METADATA: Record<CompanySection, SectionDescriptor> = {
  ceo: {
    header: "CEO Focus",
    fields: {
      focus: {
        label: "Focus",
        kind: "string",
        description: "CEO's current focus area — what is occupying primary attention right now.",
      },
      goals: {
        label: "Goals",
        kind: "string-array",
        description: "CEO's active goals for the current cycle. Set at end of each turn.",
      },
      current_priority: {
        label: "Priority",
        kind: "string",
        description: "The single most important thing the CEO is driving right now.",
      },
      blocked_on: {
        label: "Blocked On",
        kind: "string",
        description: "What is blocking the CEO, if anything — waiting on human, VP delivery, external.",
      },
      next_action: {
        label: "Next Action",
        kind: "string",
        description: "CEO's planned next action when conversation resumes.",
      },
      note_to_self: {
        label: "Note",
        kind: "string",
        description: "CEO's private note-to-self for continuity between sessions.",
      },
    },
  },
  finance: {
    header: "Finance (VP Finance)",
    fields: {
      runway_months: {
        label: "Runway",
        kind: "number",
        minimum: 0,
        description: "Months of operating runway at current burn.",
      },
      monthly_burn: {
        label: "Monthly Burn",
        kind: "number",
        minimum: 0,
        description: "Monthly cash expenditure.",
      },
      monthly_revenue: {
        label: "Monthly Revenue",
        kind: "number",
        minimum: 0,
        description: "Monthly incoming revenue.",
      },
      cash_on_hand: {
        label: "Cash on Hand",
        kind: "number",
        minimum: 0,
        description: "Total available cash.",
      },
      burn_trend: {
        label: "Burn Trend",
        kind: "string",
        description: "Trajectory of spend: increasing, stable, decreasing.",
      },
      next_funding_event: {
        label: "Next Funding Event",
        kind: "string",
        description: "Upcoming funding milestone or 'none'.",
      },
      ...NARRATIVE_FIELDS,
    },
  },
  operations: {
    header: "Operations (VP Engineering)",
    fields: {
      active_projects: {
        label: "Active Projects",
        kind: "string-array",
        description: "Projects currently in progress.",
      },
      blocked_projects: {
        label: "Blocked Projects",
        kind: "string-array",
        description: "Projects currently blocked.",
      },
      headcount: {
        label: "Headcount",
        kind: "integer",
        minimum: 0,
        description: "Current total headcount.",
      },
      open_roles: {
        label: "Open Roles",
        kind: "integer",
        minimum: 0,
        description: "Number of unfilled positions.",
      },
      system_health: {
        label: "System Health",
        kind: "string",
        description: "Overall system/infra status: green, yellow, red.",
      },
      incident_summary: {
        label: "Incident Summary",
        kind: "string",
        description: "Current or recent incidents, or 'none'.",
      },
      ...NARRATIVE_FIELDS,
    },
  },
  strategy: {
    header: "Strategy (VP Product)",
    fields: {
      current_priorities: {
        label: "Current Priorities",
        kind: "string-array",
        description: "Top-level company priorities right now.",
      },
      quarterly_objectives: {
        label: "Quarterly Objectives",
        kind: "string-array",
        description: "Key results for this quarter.",
      },
      competitive_landscape: {
        label: "Competitive Landscape",
        kind: "string",
        description: "Brief competitive context.",
      },
      pending_decisions: {
        label: "Pending Decisions",
        kind: "string-array",
        description: "Decisions awaiting CEO action.",
      },
      ...NARRATIVE_FIELDS,
    },
  },
  personnel: {
    header: "Personnel",
    fields: {
      org_mood: {
        label: "Org Mood",
        kind: "string",
        description: "General organizational sentiment: strong, mixed, low.",
      },
      attrition_risk: {
        label: "Attrition Risk",
        kind: "string",
        description: "Attrition risk level: low, moderate, high.",
      },
      key_hires_status: {
        label: "Key Hires Status",
        kind: "string",
        description: "Status of critical hiring pipelines.",
      },
      delegation_map: {
        label: "Delegation Map",
        kind: "string",
        description: "Who owns what — brief summary of delegation.",
      },
      ...NARRATIVE_FIELDS,
    },
  },
  risks: {
    header: "Risks",
    fields: {
      top_risks: {
        label: "Top Risks",
        kind: "string-array",
        description: "Highest-priority risk items.",
      },
      mitigations_in_progress: {
        label: "Mitigations In Progress",
        kind: "string-array",
        description: "Active mitigation efforts.",
      },
      risk_level: {
        label: "Risk Level",
        kind: "string",
        description: "Overall risk posture: low, moderate, elevated, critical.",
      },
      last_review: {
        label: "Last Review",
        kind: "string",
        description: "When risks were last reviewed (ISO date or relative).",
      },
      ...NARRATIVE_FIELDS,
    },
  },
  queue: {
    header: "Decision Queue",
    fields: {
      pending_count: {
        label: "Pending",
        kind: "integer",
        minimum: 0,
        description: "Number of recommendations awaiting decision.",
      },
      pending_summaries: {
        label: "Pending Items",
        kind: "string-array",
        description: "One-line summary of each pending recommendation.",
      },
      awaiting_human: {
        label: "Awaiting Human",
        kind: "string-array",
        description: "Items that exceed CEO authority and need human approval.",
      },
      last_decision: {
        label: "Last Decision",
        kind: "string",
        description: "Most recent decision made and outcome.",
      },
      last_decision_by: {
        label: "Decided By",
        kind: "string",
        description: "Who made the last decision: CEO or Human.",
      },
      report: {
        label: "Queue Status",
        kind: "string",
        description: "CEO's narrative summary of what's in the pipeline.",
      },
      decisions: {
        label: "Decisions",
        kind: "string",
        description: "Structured decision objects (JSON). Managed via add_decision/resolve_decision actions.",
      },
    },
  },
  meta: {
    header: "Company Meta",
    fields: {
      company_name: {
        label: "Company",
        kind: "string",
        description: "Company name.",
      },
      domain: {
        label: "Domain",
        kind: "string",
        description: "Business domain description.",
      },
      spawned_at: {
        label: "Spawned",
        kind: "string",
        description: "ISO timestamp of when the company was spawned.",
      },
      roles: {
        label: "Roles",
        kind: "string",
        description: "Role assignments (JSON). Array of {role, type, agentId?, telegramChatId?, displayName}.",
      },
      twilio_phone: {
        label: "Phone",
        kind: "string",
        description: "Twilio phone number for voice briefings.",
      },
      voice_enabled: {
        label: "Voice",
        kind: "string",
        description: "Whether voice briefings are enabled.",
      },
      dashboard_url: {
        label: "Dashboard",
        kind: "string",
        description: "URL for the company dashboard.",
      },
      context_path: {
        label: "Context Path",
        kind: "string",
        description: "File path to CONTEXT.md or equivalent.",
      },
      first_boot_complete: {
        label: "First Boot Complete",
        kind: "string",
        description: "Whether the CEO has completed first-boot delegation. Set to true after initial infrastructure delegation.",
      },
    },
  },
};

// --- Defaults ---

export function createDefaultCompanyState(): CompanyState {
  return {
    version: COMPANY_STATE_VERSION,
    lastUpdated: Date.now(),
    sectionUpdatedAt: {},
    ceo: {
      focus: "initializing",
      goals: [],
      current_priority: "none",
      blocked_on: "none",
      next_action: "none",
      note_to_self: "",
    },
    finance: {
      runway_months: 0,
      monthly_burn: 0,
      monthly_revenue: 0,
      cash_on_hand: 0,
      burn_trend: "unknown",
      next_funding_event: "none",
      attention: "none",
      report: "No report yet.",
      needs: "none",
      report_file: "",
    },
    operations: {
      active_projects: [],
      blocked_projects: [],
      headcount: 0,
      open_roles: 0,
      system_health: "unknown",
      incident_summary: "none",
      attention: "none",
      report: "No report yet.",
      needs: "none",
      report_file: "",
    },
    strategy: {
      current_priorities: [],
      quarterly_objectives: [],
      competitive_landscape: "unknown",
      pending_decisions: [],
      attention: "none",
      report: "No report yet.",
      needs: "none",
      report_file: "",
    },
    personnel: {
      org_mood: "unknown",
      attrition_risk: "unknown",
      key_hires_status: "unknown",
      delegation_map: "unset",
      attention: "none",
      report: "No report yet.",
      needs: "none",
      report_file: "",
    },
    risks: {
      top_risks: [],
      mitigations_in_progress: [],
      risk_level: "unknown",
      last_review: "never",
      attention: "none",
      report: "No report yet.",
      needs: "none",
      report_file: "",
    },
    queue: {
      pending_count: 0,
      pending_summaries: [],
      awaiting_human: [],
      last_decision: "none",
      last_decision_by: "none",
      report: "Queue empty.",
      decisions: [],
    },
    meta: {
      company_name: "",
      domain: "",
      spawned_at: "",
      roles: [],
      twilio_phone: "",
      voice_enabled: false,
      dashboard_url: "",
      context_path: "",
      first_boot_complete: false,
    },
  };
}

function deepFreeze<T>(obj: T): T {
  const frozen = Object.freeze(obj);
  for (const value of Object.values(frozen as Record<string, unknown>)) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return frozen;
}

export const DEFAULT_COMPANY_STATE: Readonly<CompanyState> = deepFreeze(createDefaultCompanyState());

// --- Normalization helpers ---

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeNumber(
  value: unknown,
  fallback: number,
  minimum?: number,
  maximum?: number,
): number {
  const normalized = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return clamp(normalized, minimum ?? Number.NEGATIVE_INFINITY, maximum ?? Number.POSITIVE_INFINITY);
}

function normalizeInteger(value: unknown, fallback: number, minimum = 0): number {
  const normalized = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.max(minimum, normalized);
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [...fallback];
  }
  return [...fallback];
}

// --- Section normalization ---

function normalizeCeoSection(value: unknown): CeoSection {
  const d = DEFAULT_COMPANY_STATE.ceo;
  if (!isRecord(value)) return { ...d, goals: [] };
  return {
    focus: normalizeString(value.focus, d.focus),
    goals: normalizeStringArray(value.goals, []),
    current_priority: normalizeString(value.current_priority, d.current_priority),
    blocked_on: normalizeString(value.blocked_on, d.blocked_on),
    next_action: normalizeString(value.next_action, d.next_action),
    note_to_self: normalizeString(value.note_to_self, d.note_to_self),
  };
}

function normalizeFinanceSection(value: unknown): FinanceSection {
  const d = DEFAULT_COMPANY_STATE.finance;
  if (!isRecord(value)) return { ...d };
  return {
    runway_months: normalizeNumber(value.runway_months, d.runway_months, 0),
    monthly_burn: normalizeNumber(value.monthly_burn, d.monthly_burn, 0),
    monthly_revenue: normalizeNumber(value.monthly_revenue, d.monthly_revenue, 0),
    cash_on_hand: normalizeNumber(value.cash_on_hand, d.cash_on_hand, 0),
    burn_trend: normalizeString(value.burn_trend, d.burn_trend),
    next_funding_event: normalizeString(value.next_funding_event, d.next_funding_event),
    attention: normalizeString(value.attention, d.attention),
    report: normalizeString(value.report, d.report),
    needs: normalizeString(value.needs, d.needs),
    report_file: normalizeString(value.report_file, d.report_file),
  };
}

function normalizeOperationsSection(value: unknown): OperationsSection {
  const d = DEFAULT_COMPANY_STATE.operations;
  if (!isRecord(value)) return { ...d, active_projects: [], blocked_projects: [] };
  return {
    active_projects: normalizeStringArray(value.active_projects, []),
    blocked_projects: normalizeStringArray(value.blocked_projects, []),
    headcount: normalizeInteger(value.headcount, d.headcount, 0),
    open_roles: normalizeInteger(value.open_roles, d.open_roles, 0),
    system_health: normalizeString(value.system_health, d.system_health),
    incident_summary: normalizeString(value.incident_summary, d.incident_summary),
    attention: normalizeString(value.attention, d.attention),
    report: normalizeString(value.report, d.report),
    needs: normalizeString(value.needs, d.needs),
    report_file: normalizeString(value.report_file, d.report_file),
  };
}

function normalizeStrategySection(value: unknown): StrategySection {
  const d = DEFAULT_COMPANY_STATE.strategy;
  if (!isRecord(value)) return { ...d, current_priorities: [], quarterly_objectives: [], pending_decisions: [] };
  return {
    current_priorities: normalizeStringArray(value.current_priorities, []),
    quarterly_objectives: normalizeStringArray(value.quarterly_objectives, []),
    competitive_landscape: normalizeString(value.competitive_landscape, d.competitive_landscape),
    pending_decisions: normalizeStringArray(value.pending_decisions, []),
    attention: normalizeString(value.attention, d.attention),
    report: normalizeString(value.report, d.report),
    needs: normalizeString(value.needs, d.needs),
    report_file: normalizeString(value.report_file, d.report_file),
  };
}

function normalizePersonnelSection(value: unknown): PersonnelSection {
  const d = DEFAULT_COMPANY_STATE.personnel;
  if (!isRecord(value)) return { ...d };
  return {
    org_mood: normalizeString(value.org_mood, d.org_mood),
    attrition_risk: normalizeString(value.attrition_risk, d.attrition_risk),
    key_hires_status: normalizeString(value.key_hires_status, d.key_hires_status),
    delegation_map: normalizeString(value.delegation_map, d.delegation_map),
    attention: normalizeString(value.attention, d.attention),
    report: normalizeString(value.report, d.report),
    needs: normalizeString(value.needs, d.needs),
    report_file: normalizeString(value.report_file, d.report_file),
  };
}

function normalizeRisksSection(value: unknown): RisksSection {
  const d = DEFAULT_COMPANY_STATE.risks;
  if (!isRecord(value)) return { ...d, top_risks: [], mitigations_in_progress: [] };
  return {
    top_risks: normalizeStringArray(value.top_risks, []),
    mitigations_in_progress: normalizeStringArray(value.mitigations_in_progress, []),
    risk_level: normalizeString(value.risk_level, d.risk_level),
    last_review: normalizeString(value.last_review, d.last_review),
    attention: normalizeString(value.attention, d.attention),
    report: normalizeString(value.report, d.report),
    needs: normalizeString(value.needs, d.needs),
    report_file: normalizeString(value.report_file, d.report_file),
  };
}

function normalizeDecision(value: unknown): Decision | null {
  if (!isRecord(value)) return null;
  const id = normalizeString(value.id, "");
  if (!id) return null;
  const statusRaw = normalizeString(value.status, "pending");
  const status: DecisionStatus =
    statusRaw === "approved" || statusRaw === "rejected" ? statusRaw : "pending";
  return {
    id,
    summary: normalizeString(value.summary, ""),
    source: normalizeString(value.source, ""),
    status,
    requires_human: typeof value.requires_human === "boolean" ? value.requires_human : false,
    created_at: normalizeString(value.created_at, new Date().toISOString()),
  };
}

function normalizeDecisionArray(value: unknown): Decision[] {
  if (!Array.isArray(value)) return [];
  const decisions: Decision[] = [];
  for (const entry of value) {
    const d = normalizeDecision(entry);
    if (d) decisions.push(d);
  }
  return decisions;
}

function normalizeQueueSection(value: unknown): QueueSection {
  const d = DEFAULT_COMPANY_STATE.queue;
  if (!isRecord(value)) return { ...d, pending_summaries: [], awaiting_human: [], decisions: [] };
  return {
    pending_count: normalizeInteger(value.pending_count, d.pending_count, 0),
    pending_summaries: normalizeStringArray(value.pending_summaries, []),
    awaiting_human: normalizeStringArray(value.awaiting_human, []),
    last_decision: normalizeString(value.last_decision, d.last_decision),
    last_decision_by: normalizeString(value.last_decision_by, d.last_decision_by),
    report: normalizeString(value.report, d.report),
    decisions: normalizeDecisionArray(value.decisions),
  };
}

function normalizeRoleAssignment(value: unknown): RoleAssignment | null {
  if (!isRecord(value)) return null;
  const role = normalizeString(value.role, "");
  if (!role) return null;
  const typeRaw = normalizeString(value.type, "ai");
  const type: "ai" | "human" = typeRaw === "human" ? "human" : "ai";
  return {
    role,
    type,
    agentId: typeof value.agentId === "string" ? value.agentId : undefined,
    telegramChatId: typeof value.telegramChatId === "string" ? value.telegramChatId : undefined,
    displayName: normalizeString(value.displayName, role),
  };
}

function normalizeRoleArray(value: unknown): RoleAssignment[] {
  if (!Array.isArray(value)) return [];
  const roles: RoleAssignment[] = [];
  for (const entry of value) {
    const r = normalizeRoleAssignment(entry);
    if (r) roles.push(r);
  }
  return roles;
}

function normalizeMetaSection(value: unknown): MetaSection {
  const d = DEFAULT_COMPANY_STATE.meta;
  if (!isRecord(value)) return { ...d, roles: [] };
  return {
    company_name: normalizeString(value.company_name, d.company_name),
    domain: normalizeString(value.domain, d.domain),
    spawned_at: normalizeString(value.spawned_at, d.spawned_at),
    roles: normalizeRoleArray(value.roles),
    twilio_phone: normalizeString(value.twilio_phone, d.twilio_phone),
    voice_enabled: typeof value.voice_enabled === "boolean" ? value.voice_enabled : false,
    dashboard_url: normalizeString(value.dashboard_url, d.dashboard_url),
    context_path: normalizeString(value.context_path, d.context_path),
    first_boot_complete: typeof value.first_boot_complete === "boolean" ? value.first_boot_complete : false,
  };
}

// --- Section cloning ---

function shallowCloneWithArrays(section: object): Record<string, unknown> {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(section)) {
    if (Array.isArray(value)) {
      clone[key] = value.map((item) =>
        item && typeof item === "object" ? { ...item } : item,
      );
    } else {
      clone[key] = value;
    }
  }
  return clone;
}

// --- Public API ---

export function cloneCompanyState(state: CompanyState): CompanyState {
  return {
    version: state.version,
    lastUpdated: state.lastUpdated,
    sectionUpdatedAt: { ...state.sectionUpdatedAt },
    ceo: shallowCloneWithArrays(state.ceo) as unknown as CeoSection,
    finance: shallowCloneWithArrays(state.finance) as unknown as FinanceSection,
    operations: shallowCloneWithArrays(state.operations) as unknown as OperationsSection,
    strategy: shallowCloneWithArrays(state.strategy) as unknown as StrategySection,
    personnel: shallowCloneWithArrays(state.personnel) as unknown as PersonnelSection,
    risks: shallowCloneWithArrays(state.risks) as unknown as RisksSection,
    queue: shallowCloneWithArrays(state.queue) as unknown as QueueSection,
    meta: shallowCloneWithArrays(state.meta) as unknown as MetaSection,
  };
}

export function cloneCompanyStateSection<K extends CompanySection>(
  section: K,
  value: SectionStateMap[K],
): SectionStateMap[K] {
  switch (section) {
    case "ceo":
    case "finance":
    case "operations":
    case "strategy":
    case "personnel":
    case "risks":
    case "queue":
    case "meta":
      return shallowCloneWithArrays(value) as unknown as SectionStateMap[K];
    default:
      throw new Error(`Unknown company section: ${section}`);
  }
}

export function normalizeCompanyStateSection<K extends CompanySection>(
  section: K,
  value: unknown,
): SectionStateMap[K] {
  switch (section) {
    case "ceo":
      return normalizeCeoSection(value) as SectionStateMap[K];
    case "finance":
      return normalizeFinanceSection(value) as SectionStateMap[K];
    case "operations":
      return normalizeOperationsSection(value) as SectionStateMap[K];
    case "strategy":
      return normalizeStrategySection(value) as SectionStateMap[K];
    case "personnel":
      return normalizePersonnelSection(value) as SectionStateMap[K];
    case "risks":
      return normalizeRisksSection(value) as SectionStateMap[K];
    case "queue":
      return normalizeQueueSection(value) as SectionStateMap[K];
    case "meta":
      return normalizeMetaSection(value) as SectionStateMap[K];
    default:
      throw new Error(`Unknown company section: ${section}`);
  }
}

function normalizeSectionTimestamps(value: unknown): SectionTimestamps {
  if (!isRecord(value)) return {};
  const result: SectionTimestamps = {};
  for (const key of Object.keys(value)) {
    if (isCompanySection(key) && typeof value[key] === "number") {
      result[key] = value[key] as number;
    }
  }
  return result;
}

export function normalizeCompanyState(value: unknown): CompanyState {
  if (!isRecord(value)) return createDefaultCompanyState();
  const now = Date.now();
  return {
    version: COMPANY_STATE_VERSION,
    lastUpdated: normalizeNumber(value.lastUpdated, now, 0),
    sectionUpdatedAt: normalizeSectionTimestamps(value.sectionUpdatedAt),
    ceo: normalizeCompanyStateSection("ceo", value.ceo),
    finance: normalizeCompanyStateSection("finance", value.finance),
    operations: normalizeCompanyStateSection("operations", value.operations),
    strategy: normalizeCompanyStateSection("strategy", value.strategy),
    personnel: normalizeCompanyStateSection("personnel", value.personnel),
    risks: normalizeCompanyStateSection("risks", value.risks),
    queue: normalizeCompanyStateSection("queue", value.queue),
    meta: normalizeCompanyStateSection("meta", value.meta),
  };
}

export function isCompanySection(value: string): value is CompanySection {
  return (COMPANY_SECTIONS as readonly string[]).includes(value);
}

export function getCompanySectionFieldNames(section: CompanySection): string[] {
  return Object.keys(COMPANY_METADATA[section].fields);
}

// --- Manager ---

export class CompanyStateManager {
  private state: CompanyState;
  private changeHandler?: (state: CompanyState) => void;

  constructor(initialState?: unknown) {
    this.state = normalizeCompanyState(initialState);
  }

  public setChangeHandler(handler: (state: CompanyState) => void): void {
    this.changeHandler = handler;
  }

  public getState(): CompanyState {
    return cloneCompanyState(this.state);
  }

  public getSection<K extends CompanySection>(section: K): SectionStateMap[K] {
    return cloneCompanyStateSection(section, this.state[section]);
  }

  public updateSection<K extends CompanySection>(
    section: K,
    updates: Partial<SectionStateMap[K]>,
  ): SectionStateMap[K] {
    const lastUpdated = Date.now();
    const merged = { ...this.state[section], ...updates };
    const nextSection = normalizeCompanyStateSection(section, merged);
    this.state = {
      ...this.state,
      version: COMPANY_STATE_VERSION,
      lastUpdated,
      sectionUpdatedAt: { ...this.state.sectionUpdatedAt, [section]: lastUpdated },
      [section]: nextSection,
    };
    this.changeHandler?.(this.getState());
    return this.getSection(section);
  }

  public addDecision(decision: Omit<Decision, "id" | "status" | "created_at"> & Partial<Pick<Decision, "id" | "status" | "created_at">>): Decision {
    const id = decision.id || generateDecisionId();
    const queue = this.state.queue;
    if (queue.decisions.some((d) => d.id === id)) {
      throw new Error(`Duplicate decision ID: ${id}`);
    }
    const full: Decision = {
      ...decision,
      id,
      status: decision.status ?? "pending",
      created_at: decision.created_at ?? new Date().toISOString(),
    };
    const decisions = [...queue.decisions, full];
    const pendingCount = decisions.filter((d) => d.status === "pending").length;
    this.updateSection("queue", {
      decisions,
      pending_count: pendingCount,
      pending_summaries: decisions
        .filter((d) => d.status === "pending")
        .map((d) => `[${d.source}] ${d.summary}`),
      awaiting_human: decisions
        .filter((d) => d.status === "pending" && d.requires_human)
        .map((d) => `[${d.source}] ${d.summary}`),
    } as Partial<QueueSection>);
    return full;
  }

  public resolveDecision(id: string, status: "approved" | "rejected", decidedBy: string): Decision | null {
    const queue = this.state.queue;
    const idx = queue.decisions.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    const resolved = { ...queue.decisions[idx], status };
    let decisions = [...queue.decisions];
    decisions[idx] = resolved;

    // Prune: drop oldest resolved decisions if we exceed MAX_RESOLVED_KEPT
    const resolvedCount = decisions.filter((d) => d.status !== "pending").length;
    if (resolvedCount > MAX_RESOLVED_KEPT) {
      let toDrop = resolvedCount - MAX_RESOLVED_KEPT;
      decisions = decisions.filter((d) => {
        if (toDrop > 0 && d.status !== "pending") {
          toDrop--;
          return false;
        }
        return true;
      });
    }

    const pendingCount = decisions.filter((d) => d.status === "pending").length;
    this.updateSection("queue", {
      decisions,
      pending_count: pendingCount,
      pending_summaries: decisions
        .filter((d) => d.status === "pending")
        .map((d) => `[${d.source}] ${d.summary}`),
      awaiting_human: decisions
        .filter((d) => d.status === "pending" && d.requires_human)
        .map((d) => `[${d.source}] ${d.summary}`),
      last_decision: resolved.summary,
      last_decision_by: decidedBy,
    } as Partial<QueueSection>);
    return resolved;
  }
}
