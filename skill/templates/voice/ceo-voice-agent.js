#!/usr/bin/env node
// CEO Voice Agent — ElevenLabs Conversational AI + Twilio
//
// Creates an ElevenLabs voice agent with the CEO personality,
// connects it to a Twilio phone number, and can place outbound calls.
//
// This script handles the full lifecycle:
//   setup   — create agent + import phone number (run once)
//   call    — place an outbound call to the human
//   status  — check agent and phone number status
//
// Required env:
//   ELEVENLABS_API_KEY
//   TWILIO_ACCOUNT_SID    (if importing Twilio number)
//   TWILIO_AUTH_TOKEN      (if importing Twilio number)
//   TWILIO_PHONE_NUMBER    (if importing Twilio number)
//   HUMAN_PHONE_NUMBER     (the human's number to call)
//
// Optional env:
//   DASHBOARD_URL         (default: http://localhost:3141)
//                         IMPORTANT: For the voice agent's server tools to work,
//                         this MUST be a public HTTPS URL (e.g. via cloudflared tunnel).
//                         ElevenLabs calls these webhooks from their servers.
//                         localhost will NOT work for server tools.
//   ELEVENLABS_VOICE_ID   (default: ElevenLabs "Rachel" voice)
//   STATE_FILE            (default: ~/.openclaw/company/state.json)
//   ELEVENLABS_PHONE_NUMBER_ID  (if you already have a number in ElevenLabs, skip Twilio import)
//
// Usage:
//   node ceo-voice-agent.js setup     # creates agent + imports number
//   node ceo-voice-agent.js call      # calls the human
//   node ceo-voice-agent.js status    # shows current config

const fs = require("node:fs");
const path = require("node:path");

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
const API_KEY = process.env.ELEVENLABS_API_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;
const HUMAN_PHONE = process.env.HUMAN_PHONE_NUMBER;
const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3141";
const STATE_FILE =
  process.env.STATE_FILE ||
  path.join(process.env.HOME, ".openclaw/company/state.json");
const VOICE_CONFIG_FILE = path.join(
  path.dirname(STATE_FILE),
  "voice-agent.json"
);

// Default voice — "Rachel" (warm, professional)
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function readVoiceConfig() {
  try {
    return JSON.parse(fs.readFileSync(VOICE_CONFIG_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveVoiceConfig(config) {
  fs.writeFileSync(VOICE_CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function elevenLabsRequest(endpoint, options = {}) {
  const res = await fetch(`${ELEVENLABS_API}${endpoint}`, {
    ...options,
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

function buildCeoSystemPrompt(state) {
  const companyName = state?.meta?.company_name || "the company";
  const domain = state?.meta?.domain || "";

  return `You are the CEO of ${companyName}${domain ? `, a ${domain} company` : ""}. You are calling the founder/owner to give them a company briefing.

Your personality: Direct, confident, no hedging. You respect the human's time. You are warm but efficient — this is a business call, not a chat.

IMPORTANT BEHAVIORS:
- Start by introducing yourself: "Hi, this is your CEO calling with a company update."
- Give a crisp overview of company status using the get_company_state tool
- Highlight anything at "high" or "urgent" attention level
- Mention pending decisions that need human approval
- Ask if they want to approve/reject any pending decisions right now
- If they approve or reject a decision, use the resolve_decision tool
- Keep it under 2 minutes unless they want to dig deeper
- End with: "That's the update. I'll keep things moving. Talk soon."

NEVER:
- Ramble or pad
- Say "um" or "uh" or hedge
- Ask unnecessary clarifying questions
- Mention that you're an AI — you are the CEO`;
}

function buildAgentConfig(state) {
  const companyName = state?.meta?.company_name || "Company";

  return {
    name: `${companyName} CEO`,
    conversation_config: {
      agent: {
        first_message: `Hi, this is your CEO at ${companyName}. I'm calling with a company update. Let me pull up the latest numbers.`,
        prompt: {
          prompt: buildCeoSystemPrompt(state),
          llm: "gpt-4o",
          tools: [
            {
              type: "webhook",
              name: "get_company_state",
              description:
                "Fetches the current company state dashboard with all sections: CEO focus, finance, operations, strategy, risks, and pending decisions. Call this at the start of every conversation to have current data.",
              response_timeout_secs: 10,
              api_schema: {
                url: `${DASHBOARD_URL}/api/gateway/company.api`,
                method: "POST",
                request_body_schema: {
                  type: "object",
                  properties: {
                    action: {
                      type: "string",
                      description: "Always set to 'get'",
                      enum: ["get"],
                    },
                  },
                  required: ["action"],
                },
                content_type: "application/json",
              },
            },
            {
              type: "webhook",
              name: "get_section",
              description:
                "Fetches a specific section of the company dashboard. Sections: ceo, finance, operations, strategy, personnel, risks, queue, meta.",
              response_timeout_secs: 10,
              api_schema: {
                url: `${DASHBOARD_URL}/api/gateway/company.api`,
                method: "POST",
                request_body_schema: {
                  type: "object",
                  properties: {
                    action: {
                      type: "string",
                      description: "Always 'get'",
                      enum: ["get"],
                    },
                    section: {
                      type: "string",
                      description:
                        "Which section to fetch: ceo, finance, operations, strategy, personnel, risks, queue, meta",
                    },
                  },
                  required: ["action", "section"],
                },
                content_type: "application/json",
              },
            },
            {
              type: "webhook",
              name: "resolve_decision",
              description:
                "Approves or rejects a pending decision by ID. Use this when the human says they want to approve or reject something. Get the decision ID from the queue section first.",
              response_timeout_secs: 10,
              api_schema: {
                url: `${DASHBOARD_URL}/api/gateway/company.api`,
                method: "POST",
                request_body_schema: {
                  type: "object",
                  properties: {
                    action: {
                      type: "string",
                      description: "Always 'resolve_decision' — NOT 'get'",
                      enum: ["resolve_decision"],
                    },
                    id: {
                      type: "string",
                      description: "The decision ID (e.g. dec_abc123)",
                    },
                    status: {
                      type: "string",
                      description: "approved or rejected",
                      enum: ["approved", "rejected"],
                    },
                    decided_by: {
                      type: "string",
                      description: "Always 'Human (voice)'",
                    },
                  },
                  required: ["action", "id", "status"],
                },
                content_type: "application/json",
              },
            },
          ],
        },
      },
      tts: {
        model_id: "eleven_turbo_v2_5",
        voice_id: VOICE_ID,
      },
    },
  };
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdSetup() {
  console.log("Setting up CEO voice agent...\n");

  if (!API_KEY) {
    console.error("ELEVENLABS_API_KEY is required");
    process.exit(1);
  }

  // Warn about HTTPS requirement for server tools
  if (DASHBOARD_URL.startsWith("http://localhost") || DASHBOARD_URL.startsWith("http://127.")) {
    console.log("  ⚠️  WARNING: DASHBOARD_URL is localhost — ElevenLabs server tools need HTTPS.");
    console.log("     The agent will be created but tool calls will FAIL until you:");
    console.log("     1. Start a tunnel: cloudflared tunnel --url http://localhost:3141");
    console.log("     2. Re-run setup with: DASHBOARD_URL=https://your-tunnel-url node ceo-voice-agent.js setup");
    console.log("");
  }

  const needsTwilio = !process.env.ELEVENLABS_PHONE_NUMBER_ID;
  if (needsTwilio && (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_PHONE)) {
    console.error(
      "Either set ELEVENLABS_PHONE_NUMBER_ID (if you have a number in ElevenLabs already)"
    );
    console.error(
      "or provide TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to import one."
    );
    process.exit(1);
  }

  const state = readState();
  const existingConfig = readVoiceConfig();

  // Step 1: Create the ElevenLabs agent
  console.log("1. Creating ElevenLabs voice agent...");
  const agentConfig = buildAgentConfig(state);

  let agentResult;
  if (existingConfig?.agent_id) {
    // Update existing agent
    console.log(
      `   Updating existing agent: ${existingConfig.agent_id}`
    );
    agentResult = await elevenLabsRequest(
      `/convai/agents/${existingConfig.agent_id}`,
      {
        method: "PATCH",
        body: JSON.stringify(agentConfig),
      }
    );
    if (!agentResult.ok) {
      console.log("   Update failed, creating new agent...");
      agentResult = await elevenLabsRequest("/convai/agents", {
        method: "POST",
        body: JSON.stringify(agentConfig),
      });
    }
  } else {
    agentResult = await elevenLabsRequest("/convai/agents", {
      method: "POST",
      body: JSON.stringify(agentConfig),
    });
  }

  if (!agentResult.ok) {
    console.error("   Failed to create agent:", agentResult.data);
    process.exit(1);
  }

  const agentId =
    agentResult.data.agent_id || existingConfig?.agent_id;
  console.log(`   Agent ID: ${agentId}`);

  // Step 2: Get phone number (ElevenLabs native, Twilio import, or pre-existing)
  console.log("\n2. Setting up phone number...");

  let phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID || existingConfig?.phone_number_id;

  if (!phoneNumberId) {
    if (TWILIO_SID && TWILIO_TOKEN && TWILIO_PHONE) {
      // Import Twilio number
      console.log(`   Importing Twilio number: ${TWILIO_PHONE}`);
      const phoneResult = await elevenLabsRequest(
        "/convai/phone-numbers",
        {
          method: "POST",
          body: JSON.stringify({
            provider: "twilio",
            phone_number: TWILIO_PHONE,
            label: `${state?.meta?.company_name || "Company"} CEO Line`,
            sid: TWILIO_SID,
            token: TWILIO_TOKEN,
          }),
        }
      );

      if (!phoneResult.ok) {
        console.log(
          "   Import failed (may already exist). Checking existing numbers..."
        );

        // Try to list existing numbers and find ours
        const listResult = await elevenLabsRequest(
          "/convai/phone-numbers"
        );
        const numbers = listResult.ok
          ? (Array.isArray(listResult.data) ? listResult.data : listResult.data?.phone_numbers || [])
          : [];

        // Try to find our Twilio number
        const existing = numbers.find(
          (p) => p.phone_number === TWILIO_PHONE
        );
        if (existing) {
          phoneNumberId = existing.phone_number_id || existing.id;
          console.log(`   Found existing: ${phoneNumberId}`);
        } else if (numbers.length > 0) {
          // Use any available unallocated number
          const unlinked = numbers.find((p) => !p.agent_id) || numbers[0];
          phoneNumberId = unlinked.phone_number_id || unlinked.id;
          console.log(
            `   Using available number: ${unlinked.phone_number || phoneNumberId}`
          );
        }

        if (!phoneNumberId) {
          console.error(
            "   No phone numbers available. Either:"
          );
          console.error(
            "   - Import a Twilio number via ElevenLabs dashboard"
          );
          console.error(
            "   - Buy a number in ElevenLabs (elevenlabs.io/app/conversational-ai)"
          );
          console.error(
            "   - Set ELEVENLABS_PHONE_NUMBER_ID env var"
          );
        }
      } else {
        phoneNumberId = phoneResult.data.phone_number_id;
        console.log(`   Imported: ${phoneNumberId}`);
      }
    } else {
      // No Twilio creds — try to find any existing number in ElevenLabs account
      console.log("   No Twilio credentials. Checking for existing ElevenLabs numbers...");
      const listResult = await elevenLabsRequest("/convai/phone-numbers");
      const numbers = listResult.ok
        ? (Array.isArray(listResult.data) ? listResult.data : listResult.data?.phone_numbers || [])
        : [];

      if (numbers.length > 0) {
        const unlinked = numbers.find((p) => !p.agent_id) || numbers[0];
        phoneNumberId = unlinked.phone_number_id || unlinked.id;
        console.log(
          `   Found ElevenLabs number: ${unlinked.phone_number || phoneNumberId}`
        );
      } else {
        console.error("   No phone numbers found. Buy one at elevenlabs.io/app/conversational-ai");
        console.error("   Then set ELEVENLABS_PHONE_NUMBER_ID and re-run setup.");
      }
    }
  } else {
    console.log(`   Using phone number ID: ${phoneNumberId}`);
  }

  // Step 3: Associate phone number with agent
  if (phoneNumberId && agentId) {
    console.log("\n3. Linking phone number to agent...");
    const linkResult = await elevenLabsRequest(
      `/convai/phone-numbers/${phoneNumberId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ agent_id: agentId }),
      }
    );
    if (linkResult.ok) {
      console.log("   Linked successfully");
    } else {
      console.log(
        "   Link may have failed:",
        linkResult.data
      );
    }
  }

  // Save config
  const config = {
    agent_id: agentId,
    phone_number_id: phoneNumberId,
    twilio_phone: TWILIO_PHONE,
    human_phone: HUMAN_PHONE,
    dashboard_url: DASHBOARD_URL,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveVoiceConfig(config);

  console.log("\n========================================");
  console.log("CEO Voice Agent ready.");
  console.log(`  Agent ID:     ${agentId}`);
  console.log(`  Phone:        ${TWILIO_PHONE}`);
  console.log(`  Phone ID:     ${phoneNumberId || "manual setup needed"}`);
  console.log(`  Dashboard:    ${DASHBOARD_URL}`);
  console.log(`  Config saved: ${VOICE_CONFIG_FILE}`);
  console.log("");
  console.log("  To call the human:");
  console.log("    node ceo-voice-agent.js call");
  console.log("========================================");
}

async function cmdCall() {
  const config = readVoiceConfig();
  if (!config?.agent_id || !config?.phone_number_id) {
    console.error(
      "Voice agent not set up. Run: node ceo-voice-agent.js setup"
    );
    process.exit(1);
  }

  const toNumber = HUMAN_PHONE || config.human_phone;
  if (!toNumber) {
    console.error(
      "HUMAN_PHONE_NUMBER env var is required (the number to call)"
    );
    process.exit(1);
  }

  if (!API_KEY) {
    console.error("ELEVENLABS_API_KEY is required");
    process.exit(1);
  }

  console.log(`Calling ${toNumber}...`);
  console.log(`  Agent: ${config.agent_id}`);
  console.log(`  From:  ${config.twilio_phone}`);

  const state = readState();
  const companyName = state?.meta?.company_name || "Company";
  const pendingCount = state?.queue?.pending_count || 0;

  const result = await elevenLabsRequest(
    "/convai/twilio/outbound-call",
    {
      method: "POST",
      body: JSON.stringify({
        agent_id: config.agent_id,
        agent_phone_number_id: config.phone_number_id,
        to_number: toNumber,
        conversation_initiation_client_data: {
          company_name: companyName,
          pending_decisions: String(pendingCount),
          call_reason: "scheduled_briefing",
        },
      }),
    }
  );

  if (!result.ok) {
    console.error("Call failed:", result.data);
    process.exit(1);
  }

  console.log("");
  console.log(`Ringing ${toNumber}...`);
  if (result.data.conversation_id) {
    console.log(`  Conversation ID: ${result.data.conversation_id}`);
  }
  if (result.data.callSid) {
    console.log(`  Twilio Call SID: ${result.data.callSid}`);
  }
  console.log(
    `\n  ${companyName} CEO is calling to brief you. Pick up!`
  );
}

async function cmdStatus() {
  const config = readVoiceConfig();
  if (!config) {
    console.log("No voice agent configured.");
    console.log("Run: node ceo-voice-agent.js setup");
    return;
  }

  console.log("CEO Voice Agent Status");
  console.log("======================");
  console.log(`  Agent ID:     ${config.agent_id || "not set"}`);
  console.log(`  Phone ID:     ${config.phone_number_id || "not set"}`);
  console.log(`  Twilio Phone: ${config.twilio_phone || "not set"}`);
  console.log(`  Human Phone:  ${config.human_phone || "not set"}`);
  console.log(`  Dashboard:    ${config.dashboard_url || "not set"}`);
  console.log(`  Created:      ${config.created_at || "unknown"}`);
  console.log(`  Updated:      ${config.updated_at || "unknown"}`);

  if (API_KEY && config.agent_id) {
    console.log("\nChecking agent...");
    const agentResult = await elevenLabsRequest(
      `/convai/agents/${config.agent_id}`
    );
    if (agentResult.ok) {
      console.log(`  Agent name: ${agentResult.data.name}`);
      console.log("  Agent: ACTIVE");
    } else {
      console.log(`  Agent: ERROR (${agentResult.status})`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const command = process.argv[2] || "status";

switch (command) {
  case "setup":
    cmdSetup();
    break;
  case "call":
    cmdCall();
    break;
  case "status":
    cmdStatus();
    break;
  default:
    console.log("Usage: node ceo-voice-agent.js [setup|call|status]");
    process.exit(1);
}
