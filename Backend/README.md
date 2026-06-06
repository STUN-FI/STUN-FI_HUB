# Backend (STUN-FI) — quick setup

1. Copy `.env.example` to `.env` and fill values with your own credentials. The file named `.env.example` is only a template and is not read by the app directly.

   For Google Gemini service account / enterprise auth, set:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=./Credentials/stun-fi-ai-426812cd98df.json
   GOOGLE_GENAI_USE_ENTERPRISE=true
   GOOGLE_CLOUD_PROJECT=your-project-id
   GOOGLE_CLOUD_LOCATION=us-central1
   ```

   Make sure the selected Google Cloud project has the Agent Platform API enabled:
   https://console.developers.google.com/apis/api/aiplatform.googleapis.com/overview?project=your-project-id

   Also make sure billing is enabled for the project:
   https://console.developers.google.com/billing/enable?project=your-project-id

   Or use an API key instead for the Gemini Developer API:
   ```env
   GOOGLE_API_KEY=YOUR_API_KEY_HERE
   ```

2. Install dependencies and start the server:

```bash
npm install
node server.js
```

3. AI endpoint (Google Gemini / Bison)

- POST `/api/ai/chat`
- Body: `{ "message": "Your question" }`
- Supports `GOOGLE_API_KEY` for Gemini Developer API or `GOOGLE_APPLICATION_CREDENTIALS` + `GOOGLE_CLOUD_PROJECT` for Gemini Enterprise Agent Platform.

The backend exposes a simple AI endpoint and the frontend includes a small in-page widget to call it.

The backend already serves the frontend folder located at `../SaaS` relative to the backend directory.
