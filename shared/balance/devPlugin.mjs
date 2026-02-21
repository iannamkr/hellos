import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Vite plugin: serves GET/POST /api/balance backed by shared/balance/data.json.
 * Both game and sim dev servers include this so they share balance data on disk.
 */
export function balanceApiPlugin(projectRoot) {
  const filePath = resolve(projectRoot, 'shared/balance/data.json');

  return {
    name: 'balance-api',
    configureServer(server) {
      server.middlewares.use('/api/balance', (req, res) => {
        if (req.method === 'GET') {
          try {
            const json = readFileSync(filePath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(json);
          } catch {
            res.statusCode = 404;
            res.end('{}');
          }
        } else if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', () => {
            try {
              JSON.parse(body); // validate JSON
              writeFileSync(filePath, body, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end('{"ok":true}');
            } catch {
              res.statusCode = 400;
              res.end('{"error":"Invalid JSON"}');
            }
          });
        } else {
          res.statusCode = 405;
          res.end('');
        }
      });
    },
  };
}
