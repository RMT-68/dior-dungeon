const Groq = require("groq-sdk");

let groqClient = null;

function getGroqClient() {
  if (!groqClient) {
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groqClient;
}

/**
 * Call Groq API with the specified model
 * @param {string} model - The Groq model to use
 * @param {string} prompt - The prompt to send
 * @returns {Promise<string>} The generated text response
 */
async function groq(model, prompt) {
  const allowedModels = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ];

  if (!allowedModels.includes(model)) {
    throw new Error(`Invalid Groq model name: ${model}`);
  }

  const client = getGroqClient();

  try {
    const chatCompletion = await client.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: model,
      temperature: 0.7,
      max_tokens: 4096,
    });

    return chatCompletion.choices?.[0]?.message?.content;
  } catch (error) {
    console.error("Error calling Groq API:", error.message);
    throw error;
  }
}

module.exports = groq;
