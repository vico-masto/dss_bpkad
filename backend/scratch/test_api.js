const axios = require('axios');

async function testApi() {
  try {
    const res = await axios.get('http://127.0.0.1:5000/api/reports/reconciliation/discrepancy-report', {
      params: { year: 2026 }
    });
    console.log('API Response Status:', res.status);
    console.log('Unmatched Details Count:', res.data.unmatchedDetails.length);
    if (res.data.unmatchedDetails.length > 0) {
      console.log('First 2 items:', res.data.unmatchedDetails.slice(0, 2));
    }
  } catch (e) {
    console.error('API Error:', e.message);
  }
}

testApi();
