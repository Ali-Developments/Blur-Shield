const { getDefaultConfig } = require('expo/metro-config');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');

const config = getDefaultConfig(__dirname);

if (config.transformer && config.transformer.cssModulesTransform) {
  delete config.transformer.cssModulesTransform;
}

const workspaceRoot = path.resolve(__dirname, '../..');
const monorepoNodeModules = path.join(workspaceRoot, 'node_modules');
const artifactNodeModules = path.join(__dirname, 'node_modules');

config.watchFolders = [
  ...(config.watchFolders || []),
  workspaceRoot,
  path.join(workspaceRoot, 'lib'),
];

config.resolver.nodeModulesPaths = [
  artifactNodeModules,
  monorepoNodeModules,
];

config.resolver.unstable_enableSymlinks = true;

config.resolver.unstable_conditionNames = [
  ...(config.resolver.unstable_conditionNames || []),
  'require',
  'react-native',
];

const extraNodeModules = {};
const commonPackages = [
  'expo-router',
  'metro-runtime',
  'metro',
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  'react-native-webview',
  '@tanstack/react-query',
  'zod',
  'expo',
  'expo-auth-session',
];

for (const pkg of commonPackages) {
  const workspacePath = path.join(monorepoNodeModules, pkg);
  if (fs.existsSync(workspacePath)) {
    extraNodeModules[pkg] = workspacePath;
  }
  const localPath = path.join(artifactNodeModules, pkg);
  if (fs.existsSync(localPath)) {
    extraNodeModules[pkg] = localPath;
  }
}

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  ...extraNodeModules,
};

const { blockList } = config.resolver;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  ...(blockList ? (Array.isArray(blockList) ? blockList : [blockList]) : []),
  new RegExp(escape(path.join('busboy', 'node_modules', 'busboy_tmp'))),
  new RegExp(escape(path.join('busboy', 'node_modules', 'busboy_tmp')) + '.*'),
  /\/\.venv(-\d+)?\//,
  /\/__pycache__\//,
  /\/\.expo\/types\//,
];

const API_SERVER_PORT = Number(process.env.EXPO_PUBLIC_API_PORT ?? process.env.PORT ?? 3000);

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => {
    return (req, res, next) => {
      if (req.url && req.url.startsWith('/api/')) {
        const options = {
          hostname: 'localhost',
          port:     API_SERVER_PORT,
          path:     req.url,
          method:   req.method || 'GET',
          headers: {
            ...req.headers,
            host: `localhost:${API_SERVER_PORT}`,
            'x-forwarded-host': req.headers['host'] || '',
          },
        };

        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (err) => {
          console.error('[metro-proxy] API server not reachable:', err.message);
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(
            'Browse proxy error: API server is not running on port ' + API_SERVER_PORT + '.\n' +
            'Start the API server (PORT=' + API_SERVER_PORT + ' pnpm --filter @workspace/api-server start) and try again.',
          );
        });

        req.pipe(proxyReq, { end: true });
        return;
      }

      return metroMiddleware(req, res, next);
    };
  },
};

module.exports = config;
