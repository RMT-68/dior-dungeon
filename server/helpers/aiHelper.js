const groq = require("./groq");
const gemini = require("./gemini");

// Default models
const DEFAULT_GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";

/**
 * AI Helper with Groq as primary and Gemini as fallback
 * @param {string} prompt - The prompt to send to the AI
 * @param {Object} options - Optional configuration
 * @param {string} options.groqModel - Groq model to use (default: meta-llama/llama-4-scout-17b-16e-instruct)
 * @param {string} options.geminiModel - Gemini model for fallback (default: gemini-3-flash-preview)
 * @returns {Promise<string>} The AI generated response
 */
async function aiHelper(prompt, options = {}) {
  const groqModel = options.groqModel || DEFAULT_GROQ_MODEL;
  const geminiModel = options.geminiModel || DEFAULT_GEMINI_MODEL;

  // Try Groq first (primary)
  try {
    console.log(`[AI] Attempting Groq with model: ${groqModel}`);
    const response = await groq(groqModel, prompt);

    if (response) {
      console.log("[AI] Groq request successful");
      return response;
    }

    throw new Error("Empty response from Groq");
  } catch (groqError) {
    console.warn(`[AI] Groq failed: ${groqError.message}`);
    console.log(`[AI] Falling back to Gemini with model: ${geminiModel}`);

    // Fallback to Gemini
    try {
      const response = await gemini(geminiModel, prompt);

      if (response) {
        console.log("[AI] Gemini fallback successful");
        return response;
      }

      throw new Error("Empty response from Gemini");
    } catch (geminiError) {
      console.error(`[AI] Gemini fallback also failed: ${geminiError.message}`);
      throw new Error(
        `All AI providers failed. Groq: ${groqError.message}, Gemini: ${geminiError.message}`,
      );
    }
  }
}

module.exports = {
  aiHelper,
  DEFAULT_GROQ_MODEL,
  DEFAULT_GEMINI_MODEL,
};
