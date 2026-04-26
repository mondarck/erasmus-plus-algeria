require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { initSchema } = require('./db');

const authRoutes          = require('./routes/auth');
const grantsRoutes        = require('./routes/grants');
const applicationsRoutes  = require('./routes/applications');
const universitiesRoutes  = require('./routes/universities');
const adminRoutes         = require('./routes/admin');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve the single HTML frontend
app.use(express.static(path.join(__dirname)));

// API routes
app.use('/api/auth',          authRoutes);
app.use('/api/grants',        grantsRoutes);
app.use('/api/applications',  applicationsRoutes);
app.use('/api/universities',  universitiesRoutes);
app.use('/api/admin',         adminRoutes);

// Fallback — always serve the HTML for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'erasmus-plus.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'خطأ داخلي في الخادم' });
});

// ── Local dev: listen on a port ───────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  (async () => {
    try {
      await initSchema();
      app.listen(PORT, () => {
        console.log(`🎓 Erasmus+ Algeria running on http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error('❌ Failed to start server:', err.message);
      process.exit(1);
    }
  })();
} else {
  // ── Vercel serverless: run schema init in background on cold start ────────
  initSchema().catch(console.error);
}

// Export for Vercel
module.exports = app;
