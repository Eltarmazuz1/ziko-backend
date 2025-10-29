require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health endpoint
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: Date.now() }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/giftcards', require('./routes/giftcards'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/marketplace', require('./routes/marketplace'));

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, () => {
  console.log(`🚀 ZIKO BACKEND API server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
});
