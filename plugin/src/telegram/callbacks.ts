import type { GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { CompanyStateManager } from "../state-machine.js";
import { editTelegramMessage } from "./send.js";

export interface TelegramCallbackOptions {
  /** Telegram chat ID of the authorized human. Callbacks from other users are rejected. */
  humanChatId?: string;
  /** Secret token set when registering the Telegram webhook. Verified against X-Telegram-Bot-Api-Secret-Token header. */
  secretToken?: string;
}

export function createTelegramCallbackHandler(
  manager: CompanyStateManager,
  getBotToken: () => string,
  authOptions?: TelegramCallbackOptions,
) {
  return async (opts: GatewayRequestHandlerOptions): Promise<void> => {
    const { params, respond } = opts;

    // Verify secret token if configured
    if (authOptions?.secretToken) {
      const headerToken = typeof params._secretToken === "string" ? params._secretToken : "";
      if (headerToken !== authOptions.secretToken) {
        respond(false, undefined, "Unauthorized: invalid secret token");
        return;
      }
    }

    const callbackQuery = params.callback_query as Record<string, unknown> | undefined;
    if (!callbackQuery) {
      respond(false, undefined, "Missing callback_query");
      return;
    }

    // Verify sender matches configured human chat ID
    if (authOptions?.humanChatId) {
      const from = callbackQuery.from as Record<string, unknown> | undefined;
      const senderId = String(from?.id ?? "");
      if (senderId !== authOptions.humanChatId) {
        respond(false, undefined, "Unauthorized: sender does not match configured human");
        return;
      }
    }

    const data = callbackQuery.data as string | undefined;
    if (!data) {
      respond(false, undefined, "Missing callback_data");
      return;
    }

    // Parse callback_data: "approve_dec_xxx" or "reject_dec_xxx"
    const match = data.match(/^(approve|reject)_(.+)$/);
    if (!match) {
      respond(false, undefined, `Invalid callback_data format: ${data}`);
      return;
    }

    const [, action, decisionId] = match;
    const status = action === "approve" ? "approved" : "rejected";
    const resolved = manager.resolveDecision(decisionId, status as "approved" | "rejected", "Human");

    if (!resolved) {
      respond(false, undefined, `Decision not found: ${decisionId}`);
      return;
    }

    // Edit the original message to show the outcome
    const botToken = getBotToken();
    const message = callbackQuery.message as Record<string, unknown> | undefined;
    if (botToken && message) {
      const chatId = String((message.chat as Record<string, unknown>)?.id ?? "");
      const messageId = message.message_id as number | undefined;
      if (chatId && messageId) {
        const statusEmoji = status === "approved" ? "✅" : "❌";
        await editTelegramMessage(
          botToken,
          chatId,
          messageId,
          `${statusEmoji} Decision ${status}: ${resolved.summary}`,
        );
      }
    }

    respond(true, { decision: resolved });
  };
}
