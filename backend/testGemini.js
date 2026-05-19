require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function run() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: "You are a helpful assistant." });
    
    console.log("Starting chat...");
    const chat = model.startChat({ history: [] });
    
    console.log("Sending message...");
    const result = await chat.sendMessage("Tolong jelaskan kenapa ada selisih di saldo akhir kita?");
    console.log("Response:", await result.response.text());
  } catch (err) {
    console.error("AI Error:", err.message);
    if (err.response) console.error(err.response);
  }
}

run();
