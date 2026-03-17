import type { OpenClawPluginApi, OpenClawPluginDefinition } from "openclaw/plugin-sdk";
import { parseConfig } from "./src/config.js";
import { formatCompanyStateInjection } from "./src/injection.js";
import { StatePersistence } from "./src/persistence.js";
import { CompanyStateManager } from "./src/state-machine.js";
import { registerCompanyTool } from "./src/tool.js";
import { createTelegramCallbackHandler } from "./src/telegram/callbacks.js";
import { createDashboardApiHandler } from "./src/dashboard/api.js";
import { TelegramRetryQueue } from "./src/telegram/retry.js";

const plugin: OpenClawPluginDefinition = {
  id: "company",
  name: "Company Dashboard",
  description: "Corporate state machine — executive dashboard for AI CEO and sub-agents.",
  async register(api: OpenClawPluginApi) {
    const pluginConfig = parseConfig(api.pluginConfig);
    const persistence = new StatePersistence(pluginConfig.stateDir, api.logger);

    await persistence.initialize();
    const initialState = await persistence.loadState();
    const manager = new CompanyStateManager(initialState);

    manager.setChangeHandler((state) => {
      persistence.saveState(state).catch((error) => {
        api.logger.error(`[company] Failed to persist state: ${error}`);
      });
    });

    // Set up Telegram retry queue if Telegram is configured
    const tg = pluginConfig.telegram;
    const retryQueue = tg.botToken && tg.humanChatId
      ? new TelegramRetryQueue(tg.botToken, tg.humanChatId, manager)
      : undefined;

    registerCompanyTool(api, manager, { telegram: tg, retryQueue });

    // Gateway: Telegram inline keyboard callbacks (with sender auth)
    api.registerGatewayMethod(
      "company.telegram.callback",
      createTelegramCallbackHandler(manager, () => pluginConfig.telegram.botToken, {
        humanChatId: pluginConfig.telegram.humanChatId || undefined,
        secretToken: pluginConfig.telegram.secretToken || undefined,
      }),
    );

    // Gateway: JSON API for dashboard access
    api.registerGatewayMethod(
      "company.api",
      createDashboardApiHandler(manager),
    );

    api.on("before_prompt_build", async (_event, context) => {
      if (!context?.agentId) return;

      const agentConfig = pluginConfig.agents[context.agentId];
      if (!agentConfig || !agentConfig.enabled || agentConfig.inject.length === 0) return;

      try {
        const injection = formatCompanyStateInjection(manager.getState(), agentConfig.inject);
        if (!injection) return;
        return { prependContext: injection };
      } catch (error) {
        api.logger.warn(
          `[company] Failed to inject context for ${context.agentId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });

    api.logger.info("[company] Plugin registered. Corporate dashboard loaded from disk.");
  },
};

export default plugin;
