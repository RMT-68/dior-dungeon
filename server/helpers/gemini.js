const { GoogleGenAI } = require("@google/genai");

async function gemini(model, prompt) {
  const allowedModels = [
    "gemini-3-flash-preview",
    "gemini-3-pro",
    "gemini-3-pro-preview",
  ];
  if (!allowedModels.includes(model)) {
    throw new Error(`Invalid model name: ${model}`);
  }

  // Lazy load/instantiate to support delayed env loading and mocking
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    return response?.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw error;
  }
}

module.exports = gemini;
