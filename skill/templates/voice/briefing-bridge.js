#!/usr/bin/env node
// Voice Briefing Bridge — xAI Grok + ElevenLabs/Twilio
//
// This template sets up a voice briefing system:
// 1. Reads company state from the company.api gateway
// 2. Generates a 60-second briefing script via xAI Grok
// 3. (Optional) Converts to speech via ElevenLabs
// 4. Delivers via Twilio call
//
// VP Engineering: customize this for your company's needs.
// Required env: XAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ELEVENLABS_API_KEY

const XAI_API_KEY = process.env.XAI_API_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const COMPANY_API_URL = process.env.COMPANY_API_URL || 'http://localhost:3000/api/gateway/company.api';

async function getCompanyState() {
  const res = await fetch(COMPANY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get' }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`API error: ${data.error}`);
  return data.payload;
}

async function generateBriefingScript(state) {
  if (!XAI_API_KEY) throw new Error('XAI_API_KEY not set');

  const sections = ['ceo', 'finance', 'operations', 'strategy', 'risks', 'queue'];
  const stateSnippet = {};
  for (const s of sections) {
    if (state[s]) {
      stateSnippet[s] = {
        attention: state[s].attention,
        report: state[s].report,
      };
    }
  }
  stateSnippet.queue = {
    pending_count: state.queue?.pending_count,
    awaiting_human: state.queue?.awaiting_human,
  };

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-3-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a concise executive briefing generator. Given company state data, produce a 60-second spoken briefing. Use natural speech patterns. Start with the company name and date. Hit the key numbers. Flag anything at high or urgent attention. End with pending decisions count.',
        },
        {
          role: 'user',
          content: `Company: ${state.meta?.company_name || 'Unknown'}\nDate: ${new Date().toISOString().split('T')[0]}\n\nState:\n${JSON.stringify(stateSnippet, null, 2)}`,
        },
      ],
      max_tokens: 300,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'No briefing generated.';
}

async function main() {
  console.log('📞 Voice Briefing Bridge');
  console.log('========================\n');

  try {
    console.log('1. Fetching company state...');
    const state = await getCompanyState();
    console.log(`   Company: ${state.meta?.company_name || 'Unknown'}`);

    console.log('2. Generating briefing script...');
    const script = await generateBriefingScript(state);
    console.log(`   Script (${script.length} chars):\n   ${script.substring(0, 200)}...\n`);

    // TODO: VP Engineering — implement these steps:
    // 3. Convert to speech via ElevenLabs (if ELEVENLABS_KEY is set)
    // 4. Place call via Twilio (if TWILIO_SID is set)
    console.log('3. Speech synthesis: [TODO — implement with ElevenLabs]');
    console.log('4. Phone delivery: [TODO — implement with Twilio]');
    console.log('\n✅ Briefing script generated. Implement steps 3-4 to enable voice delivery.');
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
