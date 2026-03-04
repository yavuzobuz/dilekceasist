<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1LfbFBy3UsZZeBhvXHMW_X7EpvjO2832S

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Stripe Setup (Plan Upgrade)

1. Install Stripe:
   `npm install stripe`
2. Add these variables to `.env` (or your deployment environment):
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_ID_PRO`
   - `STRIPE_PRICE_ID_TEAM`
   - `STRIPE_WEBHOOK_SECRET`
   - `APP_BASE_URL` (for checkout return URLs)
3. Start backend + frontend together:
   `npm run dev:all`
4. Open `/fiyatlandirma`, click `Pro Plan Sec` or `Team Plan Sec`, and verify Stripe Checkout opens.
5. In Stripe Dashboard, add webhook endpoint:
   - Local: `http://localhost:3001/api/billing/webhook`
   - Prod: `https://<your-domain>/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

## Codex Agent Team

This repo now includes a role-based Codex workflow in `AGENTS.md`.

Use prompts like:

- `agent team: implement X`
- `planner coder reviewer mode`
- `takim modu ile ilerle`

## Word Add-in (MVP)

Word taskpane prototype files are under:

- `public/office/word/taskpane.html`
- `public/office/word/taskpane.js`
- `public/office/word/manifest.xml`

Setup summary:

1. Manifest currently points to `https://dilekceasist.vercel.app`. If you use another domain, update `public/office/word/manifest.xml`.
2. Ensure taskpane URL is reachable: `/office/word/taskpane.html`.
3. In Word, open `My Add-ins` and upload the manifest file.
4. Select text in Word and use chatbot with quick actions:
   - `Karar Arama`
   - `Metin Duzeltme`
   - `Beyin Firtinasi`
   - `Web Aramasi`
