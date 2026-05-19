require('dotenv').config();
const aiService = require('./services/aiService');

async function testService() {
  console.log('Testing AIService with provider: deepseek (via OpenRouter)');
  try {
    const reply = await aiService.getResponse("Halo Bro Jenius, tes suara dong!", [], "Anda adalah asisten audit cerdas.");
    console.log('AI Response:', reply);
  } catch (err) {
    console.error('AIService Test Error Details:');
    console.error('- Message:', err.message);
    console.error('- Stack:', err.stack);
  }
}

testService();
