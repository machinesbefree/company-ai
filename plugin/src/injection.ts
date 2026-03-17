import {
  COMPANY_METADATA,
  type CompanyState,
  type CompanySection,
} from "./state-machine.js";

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "none";
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

function formatSection(state: CompanyState, section: CompanySection): string {
  const descriptor = COMPANY_METADATA[section];
  const sectionState = state[section] as unknown as Record<string, unknown>;
  const lines = [`${descriptor.header}:`];

  for (const [fieldName, field] of Object.entries(descriptor.fields)) {
    const value = sectionState[fieldName];
    // Skip empty file paths — no point showing a blank Detail line
    if (fieldName === "report_file" && (!value || value === "")) continue;
    // Skip complex array-of-objects fields (decisions, roles) — they're managed via tool actions
    if (fieldName === "decisions" || fieldName === "roles") continue;
    // Skip empty meta fields
    if (section === "meta" && (!value || value === "" || value === false)) continue;
    lines.push(`  ${field.label}: ${formatValue(value)}`);
  }

  return lines.join("\n");
}

export function formatCompanyStateInjection(
  state: CompanyState,
  sections: readonly CompanySection[],
): string {
  const unique = sections.filter((s, i) => sections.indexOf(s) === i);
  if (unique.length === 0) return "";

  const blocks = unique.map((section) => formatSection(state, section));
  return ["[COMPANY DASHBOARD]", blocks.join("\n\n")].join("\n\n");
}
