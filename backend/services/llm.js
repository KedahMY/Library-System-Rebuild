// BiblioVault LLM service — DashScope (Alibaba Cloud) integration for
// book summary generation and review sentiment classification.
// Uses qwen3.5-flash model. Gracefully degrades when DASHSCOPE_API_KEY is missing.
// Exports: generateBookSummary, classifySentiment

import axios from 'axios';

const LLM_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const LLM_MODEL = 'qwen3.5-flash';
const TIMEOUT_MS = 30000;

function getApiKey() {
  return process.env.DASHSCOPE_API_KEY || '';
}

/**
 * Calls the DashScope API with the given messages and returns the response text.
 * @param {Array} messages - Array of { role, content } objects
 * @returns {Promise<string>} The assistant's response text
 */
async function callDashScope(messages) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY is not set. Please configure it in backend/.env');
  }

  try {
    const response = await axios.post(
      LLM_ENDPOINT,
      {
        model: LLM_MODEL,
        messages,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: TIMEOUT_MS,
      }
    );

    if (
      response.data &&
      response.data.choices &&
      response.data.choices[0] &&
      response.data.choices[0].message
    ) {
      return response.data.choices[0].message.content.trim();
    }

    throw new Error('Unexpected response shape from DashScope API');
  } catch (err) {
    if (err.response) {
      throw new Error(`DashScope API error: ${err.response.status} ${JSON.stringify(err.response.data)}`);
    }
    if (err.code === 'ECONNABORTED') {
      throw new Error('DashScope API request timed out');
    }
    throw new Error(`DashScope API request failed: ${err.message}`);
  }
}

/**
 * Generates a book summary using the LLM.
 * @param {string} title - Book title
 * @param {string} genre - Book genre
 * @param {string} description - Existing description or context
 * @param {'short'|'medium'|'detailed'} style - Summary length style
 * @returns {Promise<string>} Generated summary
 */
export async function generateBookSummary(title, genre, description, style = 'medium') {
  const styleInstructions = {
    short: 'Generate a very brief one-sentence summary of the book.',
    medium: 'Generate a one-paragraph summary (3-5 sentences) describing the book.',
    detailed: 'Generate a detailed three-paragraph summary covering the book\'s premise, key themes, and target audience.',
  };

  const instruction = styleInstructions[style] || styleInstructions.medium;

  const prompt = `You are a professional book summarizer. ${instruction}

Title: "${title}"
Genre: ${genre}
${description ? `Description/Context: ${description}` : ''}

Generate the summary based on the information above. If limited information is available, make reasonable inferences from the title and genre.`;

  return await callDashScope([{ role: 'user', content: prompt }]);
}

/**
 * Classifies a review's sentiment as positive, negative, or neutral.
 * Returns 'neutral' on ANY error (missing key, timeout, parse failure) — never throws.
 * @param {string} reviewText - The review content to classify
 * @returns {Promise<'positive'|'negative'|'neutral'>}
 */
export async function classifySentiment(reviewText) {
  try {
    const apiKey = getApiKey();
    if (!apiKey || !reviewText || !reviewText.trim()) {
      return 'neutral';
    }

    const prompt = `Classify the sentiment of the following book review as "positive", "negative", or "neutral". Respond with ONLY one word: positive, negative, or neutral.

Review: "${reviewText.substring(0, 1000)}"

Sentiment:`;

    const result = await callDashScope([{ role: 'user', content: prompt }]);
    const cleaned = result.toLowerCase().trim();

    if (cleaned.includes('positive')) return 'positive';
    if (cleaned.includes('negative')) return 'negative';
    return 'neutral';
  } catch (err) {
    console.error('Sentiment classification error (defaulting to neutral):', err.message);
    return 'neutral';
  }
}
