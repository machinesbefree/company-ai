import type { Decision } from "../state-machine.js";

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export function buildDecisionKeyboard(decision: Decision): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve", callback_data: `approve_${decision.id}` },
        { text: "❌ Reject", callback_data: `reject_${decision.id}` },
      ],
    ],
  };
}

export function formatDecisionMessage(decision: Decision): string {
  const humanTag = decision.requires_human ? "⚠️ Requires your call" : "ℹ️ FYI";
  return [
    `📋 Decision needed:`,
    ``,
    `**${decision.summary}**`,
    ``,
    `From: ${decision.source}`,
    `Status: ${decision.status}`,
    `${humanTag}`,
  ].join("\n");
}
