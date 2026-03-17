import type { GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { CompanyStateManager } from "../state-machine.js";
import { isCompanySection } from "../state-machine.js";

export function createDashboardApiHandler(manager: CompanyStateManager) {
  return (opts: GatewayRequestHandlerOptions): void => {
    const { params, respond } = opts;
    const action = typeof params.action === "string" ? params.action : "get";

    if (action === "get") {
      const section = typeof params.section === "string" ? params.section.trim().toLowerCase() : undefined;
      if (section !== undefined) {
        if (!isCompanySection(section)) {
          respond(false, undefined, `Unknown section: ${section}`);
          return;
        }
        respond(true, manager.getSection(section));
      } else {
        respond(true, manager.getState());
      }
      return;
    }

    if (action === "update") {
      const section = typeof params.section === "string" ? params.section.trim().toLowerCase() : "";
      if (!isCompanySection(section)) {
        respond(false, undefined, "A valid section is required for update.");
        return;
      }
      const updates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(params)) {
        if (key !== "action" && key !== "section") updates[key] = value;
      }
      if (Object.keys(updates).length === 0) {
        respond(false, undefined, `No fields provided for ${section} update.`);
        return;
      }
      const result = manager.updateSection(section, updates as never);
      respond(true, result);
      return;
    }

    respond(false, undefined, "Unsupported action. Use get or update.");
  };
}
