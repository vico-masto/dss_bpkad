const axios = require('axios');

async function test() {
    try {
        const res = await axios.get('http://localhost:5000/api/reports/reconciliation/anomalies?tahun=2026', {
            headers: {
                'Authorization': 'Bearer YOUR_TOKEN_HERE' // I don't have a token, this will fail with 401
            }
        });
        console.log(res.data);
    } catch (err) {
        if (err.response) {
            console.log('Status:', err.response.status);
            console.log('Data:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.log('Error:', err.message);
        }
    }
}

// test();
console.log("Script created. I need to run the server logic directly instead of HTTP to bypass auth.");
