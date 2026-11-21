import path from 'node:path';
import express from 'express';
import {
  handleAuthBootstrapRole,
  handleAuthVerify,
  handleChat,
  handleHealth,
} from './lib/serverHandlers';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (req, res) => {
  void handleHealth(req, res);
});

app.post('/api/auth/verify', (req, res) => {
  void handleAuthVerify(req, res);
});

app.post('/api/auth/bootstrap-role', (req, res) => {
  void handleAuthBootstrapRole(req, res);
});

app.post('/api/chat', (req, res) => {
  void handleChat(req, res);
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
