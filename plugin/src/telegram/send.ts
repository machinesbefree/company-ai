import type { Decision } from "../state-machine.js";
import { buildDecisionKeyboard, formatDecisionMessage } from "./keyboards.js";

interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

export async function sendDecisionToHuman(
  botToken: string,
  chatId: string,
  decision: Decision,
): Promise<TelegramSendResult> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: formatDecisionMessage(decision),
    parse_mode: "Markdown",
    reply_markup: buildDecisionKeyboard(decision),
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!data.ok) {
      return { ok: false, error: String(data.description ?? "Telegram API error") };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function editTelegramMessage(
  botToken: string,
  chatId: string,
  messageId: number,
  text: string,
): Promise<TelegramSendResult> {
  const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown",
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!data.ok) {
      return { ok: false, error: String(data.description ?? "Telegram API error") };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
