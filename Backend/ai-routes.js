const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

function stringToBoolean(value) {
  return typeof value === "string" && ["1", "true", "yes"].includes(value.toLowerCase());
}

function getServiceAccountProjectId() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) return undefined;

  try {
    const absolutePath = path.isAbsolute(credentialsPath)
      ? credentialsPath
      : path.resolve(process.cwd(), credentialsPath);

    if (!fs.existsSync(absolutePath)) return undefined;

    const raw = fs.readFileSync(absolutePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.project_id || parsed.projectId;
  } catch (error) {
    console.warn("Unable to read GOOGLE_APPLICATION_CREDENTIALS project id:", error.message);
    return undefined;
  }
}

function createAiClient() {
  const hasServiceAccount = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);

  if (hasServiceAccount) {
    const project = process.env.GOOGLE_CLOUD_PROJECT || getServiceAccountProjectId();
    const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

    if (!project) {
      throw new Error(
        "Google Gen AI service-account mode requires GOOGLE_CLOUD_PROJECT to be set or the service account JSON to contain project_id."
      );
    }

    return new GoogleGenAI({
      enterprise: true,
      project,
      location,
      apiVersion: "v1beta1",
    });
  }

  if (process.env.GOOGLE_API_KEY) {
    return new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  }

  return null;
}

function getErrorMessage(err) {
  if (!err) return "AI service error";
  if (err.response && err.response.data && err.response.data.error && err.response.data.error.message) {
    return err.response.data.error.message;
  }
  return err.message || String(err);
}

function getModelName(body) {
  if (body && typeof body.model === "string" && body.model.trim()) {
    return body.model.trim();
  }
  return "gemini-2.5-flash";
}

const genAI = (() => {
  try {
    return createAiClient();
  } catch (error) {
    console.error("AI client initialization failed:", error);
    return null;
  }
})();

module.exports = function (app) {
  const ensureClient = (res) => {
    if (!genAI) {
      res.status(500).json({
        error: "AI client is not configured.",
        detail:
          "Set GOOGLE_API_KEY for Gemini Developer API or GOOGLE_APPLICATION_CREDENTIALS + GOOGLE_CLOUD_PROJECT for Gemini Enterprise Agent Platform.",
      });
      return false;
    }
    return true;
  };

  async function handleGenerate(req, res, inputKey, promptTemplate, resultKey) {
    try {
      if (!ensureClient(res)) return;

      const input = req.body[inputKey];
      if (!input || typeof input !== "string") {
        return res.status(400).json({ error: `${inputKey} required` });
      }

      const model = getModelName(req.body);
      const prompt = promptTemplate(input, req.body);
      const response = await genAI.models.generateContent({
        model,
        contents: prompt,
      });

      const text = response.text || "";
      return res.json({ success: true, [resultKey]: text });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      console.error("AI route error:", err?.response?.data || err);
      let friendlyMessage = errorMessage;
      if (errorMessage.includes("aiplatform.googleapis.com") || errorMessage.includes("Agent Platform API")) {
        friendlyMessage = `Google Gemini Enterprise error: ${errorMessage}. Enable the Agent Platform API (aiplatform.googleapis.com) for the selected project.`;
      }
      if (errorMessage.includes("billing") || errorMessage.includes("BILLING_DISABLED")) {
        friendlyMessage = `Google Gemini Enterprise error: ${errorMessage}. Enable billing for the selected project and retry.`;
      }
      return res.status(500).json({
        error: friendlyMessage,
      });
    }
  }

  app.post("/api/ai/chat", async (req, res) => {
    return handleGenerate(req, res, "message", (message) => `You are a helpful AI assistant. ${message}` , "reply");
  });

  app.post("/api/ai/help", async (req, res) => {
    return handleGenerate(
      req,
      res,
      "topic",
      (topic, body) =>
        body.context
          ? `Help me with: ${topic}\nContext: ${body.context}`
          : `Help me understand: ${topic}`,
      "help"
    );
  });

  app.post("/api/ai/analyze", async (req, res) => {
    return handleGenerate(
      req,
      res,
      "text",
      (text) => `Analyze the following text and provide insights:\n\n${text}`,
      "analysis"
    );
  });
};
