const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

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

function createClient() {
  if (process.env.GOOGLE_API_KEY) {
    return new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT || getServiceAccountProjectId();
  const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

  if (!project) {
    throw new Error(
      "Google Gen AI service-account mode requires GOOGLE_CLOUD_PROJECT or service account project_id."
    );
  }

  return new GoogleGenAI({
    enterprise: true,
    project,
    location,
    apiVersion: "v1",
  });
}

(async () => {
  try {
    const client = createClient();
    const res = await client.models.list();
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error("LIST MODELS ERROR");
    console.error(e);
  }
})();
