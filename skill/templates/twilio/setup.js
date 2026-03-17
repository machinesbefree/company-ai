#!/usr/bin/env node
// Twilio Setup Script — Purchase number + configure webhook
//
// VP Engineering: run this to set up Twilio for voice briefings.
// Required env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
// Optional: TWILIO_AREA_CODE (default: any US number)
//
// Usage:
//   TWILIO_ACCOUNT_SID=xxx TWILIO_AUTH_TOKEN=yyy node setup.js
//   TWILIO_ACCOUNT_SID=xxx TWILIO_AUTH_TOKEN=yyy TWILIO_AREA_CODE=415 node setup.js

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const AREA_CODE = process.env.TWILIO_AREA_CODE || '';
const WEBHOOK_URL = process.env.TWILIO_WEBHOOK_URL || '';

if (!TWILIO_SID || !TWILIO_TOKEN) {
  console.error('❌ TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
  process.exit(1);
}

const TWILIO_API = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}`;
const authHeader = 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');

async function twilioRequest(path, options = {}) {
  const url = `${TWILIO_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': authHeader,
      ...options.headers,
    },
  });
  return res.json();
}

async function searchAvailableNumbers() {
  const params = new URLSearchParams({ VoiceEnabled: 'true', SmsEnabled: 'true' });
  if (AREA_CODE) params.set('AreaCode', AREA_CODE);

  const data = await twilioRequest(`/AvailablePhoneNumbers/US/Local.json?${params}`);
  return data.available_phone_numbers || [];
}

async function purchaseNumber(phoneNumber) {
  const body = new URLSearchParams({ PhoneNumber: phoneNumber });
  if (WEBHOOK_URL) {
    body.set('VoiceUrl', WEBHOOK_URL);
    body.set('VoiceMethod', 'POST');
  }

  const data = await twilioRequest('/IncomingPhoneNumbers.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return data;
}

async function configureWebhook(phoneSid, webhookUrl) {
  const body = new URLSearchParams({
    VoiceUrl: webhookUrl,
    VoiceMethod: 'POST',
  });

  const data = await twilioRequest(`/IncomingPhoneNumbers/${phoneSid}.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return data;
}

async function main() {
  console.log('📞 Twilio Setup');
  console.log('================\n');

  console.log('1. Searching for available numbers...');
  const numbers = await searchAvailableNumbers();
  if (numbers.length === 0) {
    console.error('❌ No available numbers found. Try a different area code.');
    process.exit(1);
  }

  const chosen = numbers[0];
  console.log(`   Found ${numbers.length} numbers. Using: ${chosen.phone_number}`);
  console.log(`   Friendly name: ${chosen.friendly_name}`);

  console.log('\n2. Purchasing number...');
  const purchased = await purchaseNumber(chosen.phone_number);
  if (purchased.sid) {
    console.log(`   ✅ Purchased: ${purchased.phone_number}`);
    console.log(`   SID: ${purchased.sid}`);

    if (WEBHOOK_URL) {
      console.log(`   Webhook configured: ${WEBHOOK_URL}`);
    } else {
      console.log('   ⚠️  No TWILIO_WEBHOOK_URL set — configure the voice webhook manually.');
      console.log(`   Use: node setup.js  (with TWILIO_WEBHOOK_URL set)`);
    }

    console.log('\n📋 Next steps:');
    console.log(`   1. Update company state meta.twilio_phone to: ${purchased.phone_number}`);
    console.log('   2. Set up the voice briefing bridge (see templates/voice/)');
    console.log('   3. Configure the webhook URL to point to your briefing endpoint');
  } else {
    console.error('❌ Purchase failed:', JSON.stringify(purchased, null, 2));
    process.exit(1);
  }
}

main();
