require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('Testing Gemini with API Key:', apiKey ? 'FOUND' : 'MISSING');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent("Halo, siapa Anda?");
    const response = await result.response;
    console.log('Gemini Response:', response.text());
  } catch (err) {
    console.error('Gemini Test Error:', err.message);
  }
}

testGemini();
