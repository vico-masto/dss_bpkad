const express = require('express');
const cors = require('cors');
const compression = require('compression');
require('dotenv').config();
process.on('exit', (code) => {
  console.log(`Process exiting with code: ${code}`);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const authRoutes = require('./routes/authRoutes');
const sp2dRoutes = require('./routes/sp2dRoutes');
const pendapatanRoutes = require('./routes/pendapatanRoutes');
const dssRoutes = require('./routes/dssRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const bkuRoutes = require('./routes/bkuRoutes');

const path = require('path');

const app = express();

const PORT = process.env.PORT || 5000;

// Middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/reports', reportRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/sp2d', sp2dRoutes);
app.use('/api/pendapatan', pendapatanRoutes);
app.use('/api/dss', dssRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bku', bkuRoutes);

// Health Check
app.get('/', (req, res) => {
  res.send('DSS BPKAD API is running');
});

// 404 Handler with Detailed Logging
app.use((req, res, next) => {
  const fullPath = req.protocol + '://' + req.get('host') + req.originalUrl;
  console.log(`[404 ERROR] No route found for: ${req.method} ${req.originalUrl}`);
  console.log(`[404 INFO] Full URL: ${fullPath}`);
  console.log(`[404 INFO] Headers:`, JSON.stringify(req.headers, null, 2));
  
  res.status(404).json({ 
    message: `Route ${req.method} ${req.originalUrl} not found pada server ini`,
    path: req.originalUrl,
    method: req.method,
    suggestion: "Pastikan prefix /api sudah disertakan dan spelling route sudah benar."
  });
});

app.set('strict routing', false);
app.set('case sensitive routing', false);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR HANDLER]', err.stack);
  res.status(500).json({ 
    message: 'Internal Server Error', 
    error: err.message,
    path: req.path 
  });
});

const server = app.listen(PORT, () => {
  console.log(`[SUCCESS] Server is running on http://127.0.0.1:${PORT}`);
});

setInterval(() => {}, 60000);

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down...');
  server.close(() => process.exit(0));
});