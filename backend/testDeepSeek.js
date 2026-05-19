require('dotenv').config();

async function testDeepSeek() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  console.log('Testing DeepSeek with API Key:', apiKey ? 'FOUND (starts with ' + apiKey.substring(0, 5) + '...)' : 'MISSING');

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Halo, siapa Anda?' }],
        stream: false
      })
    });

    const data = await response.json();
    console.log('DeepSeek Response Status:', response.status);
    console.log('DeepSeek Response Data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('DeepSeek Test Error:', err);
  }
}

testDeepSeek();
