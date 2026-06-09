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
   * Chat with Local Hermes Agent via 9Router Port 20128
   */
  async chatWithLocalHermes(message, history = [], systemPrompt = '') {
    try {
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      
      history.forEach(msg => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
      
      messages.push({ role: 'user', content: message });

      // Send request to 9Router Local gateway running at port 20128
      const response = await fetch('http://127.0.0.1:20128/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'ag/gemini-flash-2.0', // Fast, low-latency execution model
          messages: messages,
          stream: false
        })
      });

      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content;
      }
      
      throw new Error(data.error?.message || 'Error communicating with 9Router local');
    } catch (err) {
      console.error('[LOCAL HERMES GATEWAY ERROR]', err);
      throw err;
    }
  }

  /**
   * Smart routing (OpenRouter-First)
   */
  async getResponse(message, history = [], systemPrompt = '') {
    // 1. Detect if caller uses Hermes Directives (@hermes or @antigravity)
    const isHermesCommand = message.trim().toLowerCase().startsWith('@hermes') || 
                            message.trim().toLowerCase().startsWith('@antigravity') ||
                            message.trim().toLowerCase().startsWith('@bot');

    if (isHermesCommand) {
      const cleanMessage = message.replace(/^@(hermes|antigravity|bot)\s*/i, '');
      const hermesSystemPrompt = `Anda adalah Antigravity (Hermes Agent Lokal), asisten cerdas Papi ViGit yang memiliki kendali otonom penuh atas PC ini. Papi memanggil Anda dari antarmuka Web DSS Kantor. Selesaikan tugasnya secara langsung, singkat, dan tepat sasaran. Gunakan Bahasa Indonesia dan sapa dengan "Papi ViGit".`;
      try {
        return await this.chatWithLocalHermes(cleanMessage, history, hermesSystemPrompt);
      } catch (err) {
        return `⚠️ **[Hermes Gateway Error]** Gagal menghubungi Agen Lokal di Port 20128.\nDetail: ${err.message}. Pastikan 9Router dan Hermes Workspace Anda aktif!`;
      }
    }

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
