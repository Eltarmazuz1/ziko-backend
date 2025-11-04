require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

// Health endpoint
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: Date.now() }));

// Routes
try {
  console.log('📦 Loading routes...');
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Auth routes loaded');
  app.use('/api/giftcards', require('./routes/giftcards'));
  console.log('✅ GiftCards routes loaded');
  app.use('/api/friends', require('./routes/friends'));
  console.log('✅ Friends routes loaded');
  app.use('/api/marketplace', require('./routes/marketplace'));
  console.log('✅ Marketplace routes loaded');
} catch (error) {
  console.error('❌ Error loading routes:', error);
  process.exit(1);
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ZIKO BACKEND API server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
});
