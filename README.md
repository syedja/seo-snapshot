# SEO Snapshot — Production Deployment Guide

Full-stack Node.js/Express app: Stripe payments → Claude SEO analysis → Resend email → Supabase leads DB.

---

## Project Structure

```
seo-snapshot-backend/
├── server.js                  ← Express entry point
├── package.json
├── .env.example               ← Copy to .env and fill in
├── supabase-schema.sql        ← Run in Supabase SQL editor
├── public/
│   └── index.html             ← Frontend (served by Express)
├── routes/
│   ├── checkout.js            ← POST /api/checkout → Stripe session
│   ├── webhook.js             ← POST /api/webhook → Stripe events
│   ├── analyze.js             ← POST /api/analyze → SEO analysis
│   └── admin.js               ← GET  /api/admin/leads
└── services/
    ├── analyzer.js            ← SEO checks + Claude AI summary
    ├── pdf.js                 ← jsPDF report generator
    ├── email.js               ← Resend email sender
    └── db.js                  ← Supabase helpers
```

---

## Step 1 — Install dependencies

```bash
cd seo-snapshot-backend
npm install
```

---

## Step 2 — Set up Supabase

1. Go to https://supabase.com → New project
2. Once created, go to **SQL Editor** → paste the contents of `supabase-schema.sql` → Run
3. Go to **Settings → API**:
   - Copy **Project URL** → `SUPABASE_URL`
   - Copy **service_role** key (NOT anon key) → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 3 — Set up Stripe

1. Go to https://dashboard.stripe.com
2. **Create a product:**
   - Products → Add product
   - Name: "SEO Snapshot Report"
   - Price: $9.00, one-time
   - Copy the **Price ID** (starts with `price_`) → `STRIPE_PRICE_ID`
3. **Get API keys:**
   - Developers → API keys
   - Copy **Secret key** (starts with `sk_live_`) → `STRIPE_SECRET_KEY`
4. **Set up webhook:**
   - Developers → Webhooks → Add endpoint
   - URL: `https://yourdomain.com/api/webhook`
   - Events to listen for: `checkout.session.completed`
   - Copy **Signing secret** (starts with `whsec_`) → `STRIPE_WEBHOOK_SECRET`

> **Testing locally?** Use the Stripe CLI:
> ```bash
> stripe listen --forward-to localhost:3000/api/webhook
> ```
> This gives you a local webhook secret for `.env`.

---

## Step 4 — Set up Resend

1. Go to https://resend.com → Create account (free: 3,000 emails/month)
2. **Add your domain:** Domains → Add Domain → follow DNS instructions
3. **Get API key:** API Keys → Create API Key → `RESEND_API_KEY`
4. Set `FROM_EMAIL` to an address at your verified domain (e.g. `reports@yourdomain.com`)

---

## Step 5 — Get your Anthropic API key

1. Go to https://console.anthropic.com
2. API Keys → Create Key → `ANTHROPIC_API_KEY`

---

## Step 6 — Configure .env

```bash
cp .env.example .env
```

Fill in all values:

```env
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com

ANTHROPIC_API_KEY=sk-ant-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

RESEND_API_KEY=re_...
FROM_EMAIL=reports@yourdomain.com
FROM_NAME=SEO Snapshot

ADMIN_PASSWORD=choose-something-strong
```

---

## Step 7 — Run locally

```bash
npm run dev
```

Open http://localhost:3000 — you should see:
```
🚀 SEO Snapshot running on http://localhost:3000
   Stripe: ✓
   Supabase: ✓
   Resend: ✓
   Claude: ✓
```

**Test the payment flow locally:**
1. In a separate terminal: `stripe listen --forward-to localhost:3000/api/webhook`
2. Use test card: `4242 4242 4242 4242`, any future expiry, any CVC

---

## Step 8 — Deploy to production

### Option A: Railway (easiest, ~$5/month)

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```
Then in Railway dashboard → Variables → add all your `.env` values.

### Option B: Render (free tier available)

1. Push code to GitHub
2. render.com → New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variables in the Render dashboard

### Option C: DigitalOcean App Platform

1. Push to GitHub
2. apps.digitalocean.com → Create App → connect repo
3. Add environment variables
4. Set run command: `node server.js`

### Option D: VPS (Ubuntu) with PM2 + nginx

```bash
# On your server
git clone your-repo
cd seo-snapshot-backend
npm install
cp .env.example .env && nano .env  # fill in values

# Install PM2
npm install -g pm2
pm2 start server.js --name seo-snapshot
pm2 save
pm2 startup

# nginx reverse proxy
sudo apt install nginx
sudo nano /etc/nginx/sites-available/seo-snapshot
```

nginx config:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/seo-snapshot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Admin Dashboard

Access at: `https://yourdomain.com` → Press `Ctrl+Shift+A`

Enter your `ADMIN_PASSWORD` to see:
- All leads (email, domain, score, date)
- Revenue totals
- Report delivery status

---

## Payment Flow (end-to-end)

```
User enters URL + email
       ↓
POST /api/checkout → creates Stripe session + saves pending lead to Supabase
       ↓
Browser redirects to Stripe hosted checkout
       ↓
User pays $9
       ↓
Stripe sends POST /api/webhook (checkout.session.completed)
       ↓
Server verifies signature → runs SEO analysis (cheerio + Claude API)
       ↓
Generates PDF → sends email via Resend → updates Supabase
       ↓
Frontend (on /success redirect) calls POST /api/analyze → renders report live
```

---

## Updating Stripe from test to live

1. In Stripe dashboard, toggle from **Test mode** to **Live mode**
2. Create a new product/price in Live mode → update `STRIPE_PRICE_ID`
3. Update `STRIPE_SECRET_KEY` to your live secret key
4. Create a new webhook endpoint pointing to your production URL → update `STRIPE_WEBHOOK_SECRET`

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Webhook 400 error | Check `STRIPE_WEBHOOK_SECRET` matches your endpoint's signing secret |
| Email not sending | Verify your domain in Resend dashboard, check `FROM_EMAIL` domain matches |
| Supabase insert fails | Make sure you're using the `service_role` key, not the `anon` key |
| Analysis fails | Check `ANTHROPIC_API_KEY` is valid and has credits |
| PDF blank/missing | jsPDF requires Node 18+; check `node --version` |

---

## Support

Built by Social Posting Inc. · https://socialpostinginc.com
