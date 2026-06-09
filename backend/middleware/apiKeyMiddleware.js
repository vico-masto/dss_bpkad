/**
 * API Key Authentication Middleware
 * Untuk bridge GAS → DSS (tanpa JWT/session)
 */
const apiKeyMiddleware = (req, res, next) => {
  const apiKey = req.header('X-API-Key');

  if (!apiKey) {
    return res.status(401).json({ 
      status: false,
      message: 'API key required. Provide via X-API-Key header.' 
    });
  }

  if (apiKey !== process.env.BRIDGE_API_KEY) {
    return res.status(403).json({ 
      status: false,
      message: 'Invalid API key.' 
    });
  }

  next();
};

module.exports = apiKeyMiddleware;
