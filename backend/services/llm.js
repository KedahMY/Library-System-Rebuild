import axios from 'axios';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const LLM_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const LLM_MODEL = 'qwen3.5-flash';

/**
 * Generate a book summary using the DashScope LLM.
 * @param {string} title - Book title
 * @param {string} genre - Book genre
 * @param {string} description - Book description
 * @param {'short'|'medium'|'detailed'} style - Summary length
 * @returns {Promise<string>} The generated summary text
 * @throws {Error} If DASHSCOPE_API_KEY is not configured or API call fails
 */
export async function generateBookSummary(title, genre, description, style = 'medium') {
  if (!DASHSCOPE_API_KEY) {
    throw new Error('DASHSCOPE_API_KEY not configured');
  }

  const stylePrompts = {
    short: 'Generate a very brief one-sentence summary of the following book.',
    medium: 'Generate a single paragraph summary of the following book.',
    detailed: 'Generate a detailed three-paragraph summary of the following book.'
  };

  const prompt = `${stylePrompts[style] || stylePrompts.medium}\n\nTitle: ${title}\nGenre: ${genre}\nDescription: ${description}`;

  try {
    const response = await axios.post(
      `${LLM_ENDPOINT}/chat/completions`,
      {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that generates book summaries.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: style === 'short' ? 100 : style === 'detailed' ? 500 : 250,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    return content.trim();
  } catch (err) {
    if (err.response) {
      console.error('LLM API error:', err.response.status, err.response.data);
      throw new Error(`LLM API error: ${err.response.data?.error?.message || err.response.statusText}`);
    }
    console.error('LLM request error:', err.message);
    throw new Error(`Failed to generate summary: ${err.message}`);
  }
}

/**
 * Classify the sentiment of a review text using DashScope.
 * On ANY error, silently returns 'neutral'.
 * @param {string} reviewText - The review text to classify
 * @returns {Promise<'positive'|'negative'|'neutral'>}
 */
export async function classifySentiment(reviewText) {
  if (!DASHSCOPE_API_KEY || !reviewText || reviewText.trim().length === 0) {
    return 'neutral';
  }

  try {
    const response = await axios.post(
      `${LLM_ENDPOINT}/chat/completions`,
      {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: 'Classify the sentiment of the following book review as "positive", "negative", or "neutral". Respond with only one word.' },
          { role: 'user', content: reviewText }
        ],
        max_tokens: 10,
        temperature: 0.1
      },
      {
        headers: {
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const raw = response.data?.choices?.[0]?.message?.content;
    if (!raw) return 'neutral';

    const sentiment = raw.trim().toLowerCase();
    if (['positive', 'negative', 'neutral'].includes(sentiment)) {
      return sentiment;
    }
    return 'neutral';
  } catch (err) {
    console.error('classifySentiment error:', err.message);
    return 'neutral';
  }
}
