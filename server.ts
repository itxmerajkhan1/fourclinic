import path from 'node:path';
import express from 'express';
import {
  handleAuthBootstrapRole,
  handleAuthVerify,
  handleChat,
  handleGuestGate,
  handleHealth,
} from './lib/serverHandlers.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));

app.all('/api/health', (req, res) => {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  void handleHealth(req, res);
});

app.all('/api/auth/verify', (req, res) => {
  void handleAuthVerify(req, res);
});

app.all('/api/auth/bootstrap-role', (req, res) => {
  void handleAuthBootstrapRole(req, res);
});

app.all('/api/chat', (req, res) => {
  void handleChat(req, res);
});

app.all('/api/guest/gate', (req, res) => {
  void handleGuestGate(req, res);
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`FourClinic server listening on http://${HOST}:${PORT}`);
  });
}

void startServer();
