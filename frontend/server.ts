import express from 'express';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createProxyMiddleware } from 'http-proxy-middleware';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use('/api', createProxyMiddleware({
  target: 'http://localhost:5000',
  changeOrigin: true,
  pathRewrite: {
    '^': '/api',
  },
  headers: {
    'Connection': 'upgrade',
  },
}));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const defaultPfxPath = path.join(process.cwd(), 'certs', 'hello-ethiopia-local.pfx');
  // A certificate is opt-in: a certificate generated for an old LAN IP makes
  // every other device reject the application after that IP changes.
  const pfxPath = process.env.ENABLE_HTTPS === 'true'
    ? (process.env.HTTPS_PFX_PATH || (fs.existsSync(defaultPfxPath) ? defaultPfxPath : undefined))
    : undefined;
  const server = pfxPath
    ? https.createServer({ pfx: fs.readFileSync(pfxPath), passphrase: process.env.HTTPS_PFX_PASSWORD || 'hello-ethiopia-local' }, app)
    : app;
  const protocol = pfxPath ? 'https' : 'http';

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on ${protocol}://localhost:${PORT}`);
  });
}

startServer();
