const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');

module.exports = function (app) {
  const agent = new http.Agent({ keepAlive: true });

  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
      agent,
      onProxyReq: (proxyReq) => {
        proxyReq.setHeader('Connection', 'keep-alive');
      },
      onProxyRes: (proxyRes) => {
        proxyRes.headers.connection = 'keep-alive';
      },
      logLevel: 'silent',
    })
  );
};
