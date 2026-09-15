# Domain Intelligence Layer: Context-Aware Suggestions

A demo web application built for the GoDaddy Airo ecosystem comparing standard keyword-only domain search with a brand-context-enriched, risk-scored recommendation engine.

---

## The Problem

GoDaddy's product ecosystem previously featured two disconnected experiences:
1. **Conversational AI Agent**: Produces brand-coherent, contextual names given business descriptions.
2. **"Purchase a New Domain" Search Widget**: Queries raw keyword suggestions without brand or intent context, often returning generic, scam-pattern, or cheap disposable TLDs (e.g. `goldpledge.site`, `loanvaultgold.xyz`).

This dashboard demonstrates the intelligence layer fix:
- Enriches the raw query with business context via Google Gemini before calling GoDaddy's suggestion API.
- Evaluates candidate domains with **Deterministic Risk Scoring** (scam keywords, typosquat protection via Levenshtein distance, and TLD risk weighting).
- Ranks candidates with **Relevance Scoring** (0-100) and confirms live GoDaddy registry availability and pricing.

---

## Environment Variables Setup

A template file [`.env.example`](./.env.example) is included with all required variables.

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Configure the three required variables in `.env.local`:

```env
# GoDaddy API Personal Access Token (PAT)
# Generated from: https://developer.godaddy.com/keys
GODADDY_PAT=your_godaddy_pat_here

# GoDaddy API Base URL (Production recommended: https://api.godaddy.com)
GODADDY_API_BASE=https://api.godaddy.com

# Google Gemini API Key
# Generated from: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## Stage-Safe Fallback / Mock Mode

Presentations and live technical interviews frequently suffer from external API rate limits (HTTP 429), quota exhaustion, Gemini 503 capacity spikes, or GoDaddy test sandbox latency.

To ensure the demo **never dies on stage**, this application includes a built-in, two-tier resilient fallback system:

1. **Automatic Failover**: If Gemini or GoDaddy times out (6s circuit breaker), returns an error, or hits rate limits, the backend automatically serves high-fidelity fallback datasets with verified pricing and relevance scoring.
2. **Manual Mock Mode Toggle**: Click the `"Mock Fallback"` button in the top-right header to force offline mock mode for testing without calling external APIs.

---

## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

- Select preset scenarios (e.g., *SwarnaSeva Gold Loan*, *ChaiCraft Artisan*, *PulseFit Studio*) or type custom brand names and business goals.
- Click **Compare** to view live side-by-side results.
- Click `+` on any domain to trigger the registration toast notification.
