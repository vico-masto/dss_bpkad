const express = require('express');
const router = require('./routes/reportRoutes');
const app = express();

app.use('/api/reports', router);

const routes = [];
app._router.stack.forEach(middleware => {
    if (middleware.route) {
        routes.push(middleware.route.path);
    } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach(handler => {
            if (handler.route) {
                routes.push('/api/reports' + handler.route.path);
            }
        });
    }
});

console.log('Registered Routes:');
routes.forEach(r => console.log(r));

if (routes.includes('/api/reports/reconciliation/anomalies')) {
    console.log('\n[SUCCESS] /api/reports/reconciliation/anomalies is registered.');
} else {
    console.log('\n[FAILED] /api/reports/reconciliation/anomalies NOT found.');
}
