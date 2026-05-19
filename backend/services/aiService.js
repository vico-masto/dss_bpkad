const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * AI Service strictly using OpenRouter as the primary provider
 */
class AIService {
  constructor() {
    this.openrouterKey = process.env.OPENROUTER_API_KEY;
    this.geminiKey = process.env.GEMINI_API_KEY;
  }

  /**
   * Chat with AI via OpenRouter
   * Primary model: deepseek/deepseek-chat
   */
  async chatWithOpenRouter(message, history = [], systemPrompt = '') {
    if (!this.openrouterKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    try {
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      // Format history
      history.forEach(msg => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });

      messages.push({ role: 'user', content: message });

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openrouterKey}`,
          'HTTP-Referer': 'https://dss-bpkad.internal',
          'X-Title': 'DSS BPKAD Smart Assistant'
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: messages,
          stream: false
        })
      });

      const data = await response.json();
      
      if (data.error) {
        if (data.error.message && data.error.message.includes('Insufficient Balance')) {
          throw new Error('SALDO_OPENROUTER_HABIS');
        }
        throw new Error(data.error.message || 'OpenRouter API Error');
      }

      return data.choices[0].message.content;
    } catch (err) {
      console.error('[OPENROUTER ERROR]', err);
      throw err;
    }
  }

  /**
   * Chat with Gemini (Last Resort Fallback)
   */
  async chatWithGemini(message, history = [], systemPrompt = '') {
    if (!this.geminiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    try {
      const genAI = new GoogleGenerativeAI(this.geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const formattedHistory = history.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      const chat = model.startChat({
        history: formattedHistory,
      });

      const finalMessage = systemPrompt ? `[SYSTEM INSTRUCTION: ${systemPrompt}]\n\nUser Message: ${message}` : message;

      const result = await chat.sendMessage(finalMessage);
      const response = await result.response;
      return response.text();
    } catch (err) {
      console.error('[GEMINI ERROR]', err);
      throw err;
    }
  }

  /**
   * Smart routing (OpenRouter-First)
   */
  async getResponse(message, history = [], systemPrompt = '') {
    if (this.openrouterKey) {
      try {
        return await this.chatWithOpenRouter(message, history, systemPrompt);
      } catch (err) {
        console.warn('OpenRouter failed, falling back to Gemini if available...', err.message);
        if (this.geminiKey) {
          return await this.chatWithGemini(message, history, systemPrompt);
        }
        throw err;
      }
    }

    // Default to Gemini if OpenRouter is not set
    return await this.chatWithGemini(message, history, systemPrompt);
  }
}

module.exports = new AIService();
