---
name: domain-ops
description: Buy domains and deploy websites via OVH API. Check availability, purchase, configure DNS, and deploy a landing page — all programmatically. Use when spinning up a new company/project that needs a web presence.
---

# Domain Ops — OVH Domain Purchase & Site Deploy

Buy a domain, set DNS, and deploy a website in one flow via the OVH API.

## Prerequisites

- OVH API credentials in 1Password ("OVH API" item) or environment:
  - `OVH_APP_KEY` — Application key
  - `OVH_APP_SECRET` — Application secret
  - `OVH_CONSUMER_KEY` — Consumer key
- OVH account with payment method (charges to account balance or card on file)
- API endpoint: `https://ca.api.ovh.com/1.0` (Canadian subsidiary)

## Commands

### Check domain availability
```bash
bash ~/.openclaw/workspace-kara/skills/domain-ops/scripts/domain-ops.sh check <domain>
```
Returns: available/taken, price (CAD), available durations.

### Buy a domain
```bash
bash ~/.openclaw/workspace-kara/skills/domain-ops/scripts/domain-ops.sh buy <domain> [--duration P1Y]
```
Creates cart → adds domain → checks out → returns order ID.
Default duration: 1 year (P1Y). Domain charges to OVH account.

**⚠️ GUARDRAIL: Always confirm with the human before running `buy`. This spends real money.**

### Set DNS records
```bash
bash ~/.openclaw/workspace-kara/skills/domain-ops/scripts/domain-ops.sh dns <domain> --type A --target <ip>
bash ~/.openclaw/workspace-kara/skills/domain-ops/scripts/domain-ops.sh dns <domain> --type CNAME --target <hostname>
```
Adds/updates DNS records in OVH's zone for the domain.

### Deploy a landing page
```bash
bash ~/.openclaw/workspace-kara/skills/domain-ops/scripts/domain-ops.sh site <domain> --ip <vps-ip> --title "Company Name" [--template landing]
```
SSHs to the VPS, sets up nginx vhost, deploys landing page template, configures SSL via certbot.

### Full pipeline (check → buy → DNS → site)
```bash
bash ~/.openclaw/workspace-kara/skills/domain-ops/scripts/domain-ops.sh pipeline <domain> --ip <vps-ip> --title "Company Name"
```
Runs the full flow. Still prompts for buy confirmation unless `--yes` flag is passed.

### List owned domains
```bash
bash ~/.openclaw/workspace-kara/skills/domain-ops/scripts/domain-ops.sh list
```

## Flow for Company AI Integration

The CEO bot calls this skill during company spawn:
1. `check <company-domain>.com` — verify availability
2. `buy <company-domain>.com` — purchase (human approves via Telegram)
3. `dns <company-domain>.com --type A --target <vps-ip>` — point to server
4. `site <company-domain>.com --ip <vps-ip> --title "Company Name"` — deploy landing page
5. VP Engineering takes over from there for custom site build

## Pricing Reference (CAD, OVH Canada)
- `.com` — ~$12.59/yr
- `.ca` — ~$11.99/yr  
- `.ai` — ~$89.99/yr
- `.io` — ~$39.99/yr

## Security Notes
- API credentials are read from 1Password at runtime (not stored on disk)
- Buy operations require explicit human approval
- SSH to VPS uses existing key-based auth
- SSL certs via Let's Encrypt (certbot)
