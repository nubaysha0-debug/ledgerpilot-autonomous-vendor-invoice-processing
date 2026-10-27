<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/37f4fe3e-fa79-4643-a77f-90391d5e4ed8

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

## LedgerPilot local demo

This repository now runs the LedgerPilot payables console. The AI Studio scaffold above is not
used by the demo path, and no Gemini key or external service is required.

```powershell
npm install --legacy-peer-deps --no-audit --no-fund
npm run dev
```

Open `http://localhost:3000`. Use **Data** to import vendor and invoice CSVs, download a JSON
backup, restore it, or reset to the synthetic seed. See `DEMO_SCRIPT.md` for the walkthrough,
numbers and caveats.

Confidence checks:

```powershell
npm run check:ledger   # 116 ledger assertions
npm run check:import   # 77 CSV and round-trip assertions
npm run lint
npm run build
```
