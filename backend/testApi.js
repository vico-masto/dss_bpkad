const intelligenceController = require('./controllers/intelligenceController');
const reportController = require('./controllers/reportController');

async function test() {
  const req = {
    body: { message: "Test", history: [] },
    query: { startDate: "2026-01-01", endDate: "2026-12-31" }
  };
  const res = {
    status: (code) => ({ json: (data) => console.log("Status", code, data) }),
    json: (data) => console.log("Success", data)
  };

  console.log("Testing Chat...");
  await intelligenceController.chatWithAI(req, res);

  console.log("\nTesting BKU...");
  await reportController.getBkuReport(req, res);
}

test();
