#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# domain-ops.sh — OVH Domain Purchase & Site Deploy
# ============================================================
# Usage:
#   domain-ops.sh check <domain>
#   domain-ops.sh buy <domain> [--duration P1Y] [--yes]
#   domain-ops.sh dns <domain> --type A|CNAME --target <value> [--subdomain @|www|*]
#   domain-ops.sh site <domain> --ip <vps-ip> --title "Name" [--ssh-user ubuntu]
#   domain-ops.sh pipeline <domain> --ip <vps-ip> --title "Name" [--yes]
#   domain-ops.sh list
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# OVH API config
OVH_ENDPOINT="${OVH_ENDPOINT:-https://ca.api.ovh.com/1.0}"
OVH_AK="${OVH_APP_KEY:?Set OVH_APP_KEY}"
OVH_AS="${OVH_APP_SECRET:?Set OVH_APP_SECRET}"
OVH_CK="${OVH_CONSUMER_KEY:?Set OVH_CONSUMER_KEY}"

# ---- OVH API signing ----
ovh_call() {
  local METHOD="$1" URL_PATH="$2" BODY="${3:-}"
  local FULL_URL="${OVH_ENDPOINT}${URL_PATH}"
  local SERVER_TIME
  SERVER_TIME=$(curl -sf "${OVH_ENDPOINT}/auth/time")
  local PRESIGN="${OVH_AS}+${OVH_CK}+${METHOD}+${FULL_URL}+${BODY}+${SERVER_TIME}"
  local SIG="\$1\$$(echo -n "$PRESIGN" | sha1sum | cut -d' ' -f1)"
  
  local ARGS=(-s -X "$METHOD"
    -H "X-Ovh-Application: $OVH_AK"
    -H "X-Ovh-Consumer: $OVH_CK"
    -H "X-Ovh-Timestamp: $SERVER_TIME"
    -H "X-Ovh-Signature: $SIG"
  )
  
  if [ -n "$BODY" ]; then
    ARGS+=(-H "Content-Type: application/json" -d "$BODY")
  fi
  
  curl "${ARGS[@]}" "$FULL_URL"
}

# ---- Helpers ----
json_val() {
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d$1)" 2>/dev/null
}

json_pretty() {
  python3 -m json.tool 2>/dev/null
}

die() { echo "ERROR: $*" >&2; exit 1; }

# ============================================================
# COMMANDS
# ============================================================

cmd_check() {
  local DOMAIN="${1:?Usage: domain-ops.sh check <domain>}"
  
  echo "Checking availability: $DOMAIN"
  
  # Create cart
  local CART
  CART=$(ovh_call POST "/order/cart" '{"ovhSubsidiary":"CA","description":"domain-check"}')
  local CART_ID
  CART_ID=$(echo "$CART" | json_val "['cartId']")
  
  # Assign cart
  ovh_call POST "/order/cart/$CART_ID/assign" > /dev/null
  
  # Check domain
  local RESULT
  RESULT=$(ovh_call GET "/order/cart/$CART_ID/domain?domain=$DOMAIN")
  
  # Parse result
  python3 -c "
import json, sys
data = json.loads('''$RESULT''')
if not data:
    print('❌ Domain not available or not supported')
    sys.exit(1)
item = data[0]
if item.get('orderable'):
    prices = item.get('prices', [])
    price_info = next((p for p in prices if p['label'] == 'PRICE'), None)
    if price_info:
        print(f\"✅ {'"$DOMAIN"'} is AVAILABLE\")
        print(f\"   Price: {price_info['price']['text']}/yr\")
        print(f\"   Durations: {', '.join(item.get('duration', []))}\")
        print(f\"   Offer: {item.get('offer', 'N/A')}\")
    else:
        print(f\"✅ {'"$DOMAIN"'} is AVAILABLE (price not shown)\")
else:
    print(f\"❌ {'"$DOMAIN"'} is NOT available\")
" 2>&1 || echo "❌ Could not parse availability response"
  
  # Cleanup cart (best effort)
  ovh_call DELETE "/order/cart/$CART_ID" > /dev/null 2>&1 || true
}

cmd_buy() {
  local DOMAIN="" DURATION="P1Y" AUTO_YES=false
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --duration) DURATION="$2"; shift 2;;
      --yes) AUTO_YES=true; shift;;
      *) DOMAIN="$1"; shift;;
    esac
  done
  
  [ -z "$DOMAIN" ] && die "Usage: domain-ops.sh buy <domain> [--duration P1Y] [--yes]"
  
  echo "🛒 Purchasing domain: $DOMAIN (duration: $DURATION)"
  
  # Create cart
  local CART
  CART=$(ovh_call POST "/order/cart" '{"ovhSubsidiary":"CA","description":"domain-purchase"}')
  local CART_ID
  CART_ID=$(echo "$CART" | json_val "['cartId']")
  echo "   Cart: $CART_ID"
  
  # Assign cart
  ovh_call POST "/order/cart/$CART_ID/assign" > /dev/null
  
  # Add domain to cart
  local ADD_RESULT
  ADD_RESULT=$(ovh_call POST "/order/cart/$CART_ID/domain" \
    "{\"domain\":\"$DOMAIN\",\"duration\":\"$DURATION\"}")
  
  local ITEM_ID
  ITEM_ID=$(echo "$ADD_RESULT" | json_val "['itemId']") || die "Failed to add domain to cart. Response: $ADD_RESULT"
  echo "   Item added: $ITEM_ID"
  
  # Check required configurations
  local CONFIGS
  CONFIGS=$(ovh_call GET "/order/cart/$CART_ID/item/$ITEM_ID/requiredConfiguration")
  
  # Apply required configs (owner contact etc)
  python3 -c "
import json
configs = json.loads('''$CONFIGS''')
for c in configs:
    label = c.get('label', '')
    if label == 'OWNER_LEGAL_AGE':
        print(f'CONFIG:{label}:true')
    elif label == 'OWNER_CONTACT':
        # Use account's own contact
        print(f'CONFIG:{label}:/me/contact')
    elif label == 'ADMIN_ACCOUNT':
        print(f'CONFIG:{label}:/me')
    elif label == 'TECH_ACCOUNT':  
        print(f'CONFIG:{label}:/me')
" 2>/dev/null | while IFS=: read -r _ LABEL VALUE; do
    ovh_call POST "/order/cart/$CART_ID/item/$ITEM_ID/configuration" \
      "{\"label\":\"$LABEL\",\"value\":\"$VALUE\"}" > /dev/null 2>&1
    echo "   Config: $LABEL = $VALUE"
  done
  
  # Get cart summary / pricing
  local SUMMARY
  SUMMARY=$(ovh_call GET "/order/cart/$CART_ID/checkout")
  
  local TOTAL_PRICE
  TOTAL_PRICE=$(echo "$SUMMARY" | python3 -c "
import json,sys
d = json.load(sys.stdin)
prices = d.get('prices', {})
total = prices.get('withTax', prices.get('withoutTax', {}))
print(total.get('text', 'unknown'))
" 2>/dev/null || echo "unknown")
  
  echo ""
  echo "   💰 Total: $TOTAL_PRICE"
  echo ""
  
  if [ "$AUTO_YES" != "true" ]; then
    echo "⚠️  This will charge your OVH account $TOTAL_PRICE"
    echo "   Run with --yes to auto-confirm, or confirm now:"
    read -p "   Proceed? [y/N] " CONFIRM
    [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Cancelled."; ovh_call DELETE "/order/cart/$CART_ID" > /dev/null 2>&1 || true; exit 0; }
  fi
  
  # Checkout
  echo "   Checking out..."
  local ORDER
  ORDER=$(ovh_call POST "/order/cart/$CART_ID/checkout" '{"autoPayWithPreferredPaymentMethod":true,"waiveRetractationPeriod":true}')
  
  local ORDER_ID
  ORDER_ID=$(echo "$ORDER" | python3 -c "import json,sys; print(json.load(sys.stdin).get('orderId', 'unknown'))" 2>/dev/null)
  
  echo ""
  echo "✅ Domain ordered!"
  echo "   Order ID: $ORDER_ID"
  echo "   Domain: $DOMAIN"
  echo "   Duration: $DURATION"
  echo "   Note: DNS zone creation may take a few minutes"
  echo ""
  echo "$ORDER" | json_pretty
}

cmd_dns() {
  local DOMAIN="" RECORD_TYPE="" TARGET="" SUBDOMAIN=""
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --type) RECORD_TYPE="$2"; shift 2;;
      --target) TARGET="$2"; shift 2;;
      --subdomain) SUBDOMAIN="$2"; shift 2;;
      *) DOMAIN="$1"; shift;;
    esac
  done
  
  [ -z "$DOMAIN" ] || [ -z "$RECORD_TYPE" ] || [ -z "$TARGET" ] && \
    die "Usage: domain-ops.sh dns <domain> --type A|CNAME --target <value> [--subdomain www]"
  
  SUBDOMAIN="${SUBDOMAIN:-}"
  
  echo "🌐 Setting DNS: $DOMAIN"
  echo "   Type: $RECORD_TYPE"
  echo "   Subdomain: ${SUBDOMAIN:-@ (root)}"
  echo "   Target: $TARGET"
  
  # Add record
  local RESULT
  RESULT=$(ovh_call POST "/domain/zone/$DOMAIN/record" \
    "{\"fieldType\":\"$RECORD_TYPE\",\"subDomain\":\"$SUBDOMAIN\",\"target\":\"$TARGET\",\"ttl\":3600}")
  
  echo "$RESULT" | json_pretty
  
  # Also add www if root
  if [ -z "$SUBDOMAIN" ] && [ "$RECORD_TYPE" = "A" ]; then
    echo "   Also adding www → $TARGET"
    ovh_call POST "/domain/zone/$DOMAIN/record" \
      "{\"fieldType\":\"A\",\"subDomain\":\"www\",\"target\":\"$TARGET\",\"ttl\":3600}" | json_pretty
  fi
  
  # Refresh zone
  echo "   Refreshing zone..."
  ovh_call POST "/domain/zone/$DOMAIN/refresh" > /dev/null 2>&1
  echo "✅ DNS records set. Propagation may take a few minutes."
}

cmd_site() {
  local DOMAIN="" IP="" TITLE="" SSH_USER="ubuntu" TEMPLATE="landing"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ip) IP="$2"; shift 2;;
      --title) TITLE="$2"; shift 2;;
      --ssh-user) SSH_USER="$2"; shift 2;;
      --template) TEMPLATE="$2"; shift 2;;
      *) DOMAIN="$1"; shift;;
    esac
  done
  
  [ -z "$DOMAIN" ] || [ -z "$IP" ] || [ -z "$TITLE" ] && \
    die "Usage: domain-ops.sh site <domain> --ip <vps-ip> --title 'Name' [--ssh-user ubuntu]"
  
  echo "🚀 Deploying site: $DOMAIN → $IP"
  echo "   Title: $TITLE"
  echo "   SSH: $SSH_USER@$IP"
  
  # Generate landing page from template
  local LANDING_HTML
  LANDING_HTML=$(cat "$SCRIPT_DIR/../templates/landing.html" 2>/dev/null | \
    sed "s/{{TITLE}}/$TITLE/g" | \
    sed "s/{{DOMAIN}}/$DOMAIN/g")
  
  if [ -z "$LANDING_HTML" ]; then
    # Fallback minimal template
    LANDING_HTML="<!DOCTYPE html><html><head><title>$TITLE</title><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;text-align:center}.container{max-width:600px;padding:2rem}h1{font-size:3rem;margin-bottom:1rem;background:linear-gradient(135deg,#00d4aa,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#888;font-size:1.2rem;line-height:1.6}</style></head><body><div class='container'><h1>$TITLE</h1><p>Something is being built here.</p><p style='margin-top:2rem;font-size:0.9rem;color:#555'>$DOMAIN</p></div></body></html>"
  fi
  
  # Deploy via SSH
  ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$SSH_USER@$IP" bash -s "$DOMAIN" "$TITLE" <<'DEPLOY_EOF'
DOMAIN="$1"
TITLE="$2"
WEBROOT="/var/www/$DOMAIN"

# Install nginx if needed
which nginx > /dev/null 2>&1 || {
  sudo apt-get update -qq && sudo apt-get install -y -qq nginx certbot python3-certbot-nginx
}

# Create webroot
sudo mkdir -p "$WEBROOT"
sudo chown -R www-data:www-data "$WEBROOT"

# Write nginx config
sudo tee "/etc/nginx/sites-available/$DOMAIN" > /dev/null <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    root $WEBROOT;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ =404;
    }
}
NGINX

# Enable site
sudo ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/"
sudo nginx -t && sudo systemctl reload nginx

echo "✅ Nginx configured for $DOMAIN"
DEPLOY_EOF
  
  # Write the landing page
  echo "$LANDING_HTML" | ssh -o ConnectTimeout=10 "$SSH_USER@$IP" "sudo tee /var/www/$DOMAIN/index.html > /dev/null"
  
  echo "✅ Landing page deployed"
  
  # Try SSL (may fail if DNS hasn't propagated yet)
  echo "   Attempting SSL certificate..."
  ssh -o ConnectTimeout=10 "$SSH_USER@$IP" \
    "sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m will@sentinelinstitute.ca 2>&1" || \
    echo "   ⚠️ SSL failed (DNS may not have propagated yet). Run certbot manually later."
  
  echo ""
  echo "✅ Site deployed!"
  echo "   URL: http://$DOMAIN"
  echo "   Webroot: /var/www/$DOMAIN/"
}

cmd_pipeline() {
  local DOMAIN="" IP="" TITLE="" AUTO_YES=false DURATION="P1Y" SSH_USER="ubuntu"
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ip) IP="$2"; shift 2;;
      --title) TITLE="$2"; shift 2;;
      --yes) AUTO_YES=true; shift;;
      --duration) DURATION="$2"; shift 2;;
      --ssh-user) SSH_USER="$2"; shift 2;;
      *) DOMAIN="$1"; shift;;
    esac
  done
  
  [ -z "$DOMAIN" ] || [ -z "$IP" ] || [ -z "$TITLE" ] && \
    die "Usage: domain-ops.sh pipeline <domain> --ip <vps-ip> --title 'Name' [--yes]"
  
  echo "🔗 Full pipeline: $DOMAIN → $IP"
  echo "========================================"
  echo ""
  
  # Step 1: Check
  echo "Step 1/4: Checking availability..."
  cmd_check "$DOMAIN"
  echo ""
  
  # Step 2: Buy
  echo "Step 2/4: Purchasing domain..."
  local BUY_ARGS=("$DOMAIN" "--duration" "$DURATION")
  [ "$AUTO_YES" = "true" ] && BUY_ARGS+=("--yes")
  cmd_buy "${BUY_ARGS[@]}"
  echo ""
  
  # Step 3: Wait for zone then set DNS
  echo "Step 3/4: Configuring DNS..."
  echo "   Waiting 30s for DNS zone creation..."
  sleep 30
  cmd_dns "$DOMAIN" --type A --target "$IP"
  echo ""
  
  # Step 4: Deploy site
  echo "Step 4/4: Deploying site..."
  cmd_site "$DOMAIN" --ip "$IP" --title "$TITLE" --ssh-user "$SSH_USER"
  echo ""
  
  echo "========================================"
  echo "🎉 Pipeline complete!"
  echo "   Domain: $DOMAIN"
  echo "   Server: $IP"
  echo "   URL: http://$DOMAIN (HTTPS after DNS propagation)"
}

cmd_list() {
  echo "📋 Domains on OVH account:"
  ovh_call GET "/domain" | python3 -c "
import json, sys
domains = json.load(sys.stdin)
for d in sorted(domains):
    print(f'  • {d}')
print(f'\nTotal: {len(domains)} domain(s)')
"
}

# ============================================================
# MAIN
# ============================================================

CMD="${1:-help}"
shift || true

case "$CMD" in
  check)    cmd_check "$@";;
  buy)      cmd_buy "$@";;
  dns)      cmd_dns "$@";;
  site)     cmd_site "$@";;
  pipeline) cmd_pipeline "$@";;
  list)     cmd_list;;
  help|*)
    echo "domain-ops.sh — OVH Domain Purchase & Site Deploy"
    echo ""
    echo "Commands:"
    echo "  check <domain>              Check availability"
    echo "  buy <domain> [--yes]        Purchase domain"
    echo "  dns <domain> --type --target Set DNS records"
    echo "  site <domain> --ip --title  Deploy landing page"
    echo "  pipeline <domain> --ip --title Full flow"
    echo "  list                        List owned domains"
    ;;
esac
