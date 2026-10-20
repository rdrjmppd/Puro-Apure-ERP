import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fetchBCVRate, initBCVCronJob } from './server/fetchBCVRate';
import { createUserAccountHandler, listUsersHandler } from './server/createUserAccount';
import { askGeminiAssistantHandler } from './server/askGeminiAssistant';
import { uploadLogoHandler, resetLogoHandler, getBrandingHandler, ensureBrandingIntegrity } from './server/uploadLogo';
import { getWhatsAppLineStatusHandler, generateQrCodeHandler, confirmPairingHandler } from './server/whatsappQrBridge';

function bcvServerProxyPlugin(): Plugin {
  return {
    name: 'bcv-server-proxy',
    configureServer(server) {
      // Iniciar el Cron Job programado autónomo a las 17:00 Hrs
      initBCVCronJob((res) => {
        console.log(`[Cron 17:00] Tasa oficial BCV actualizada a: ${res.rateUSD_VES} VES/USD`);
      });

      // Verificación de integridad del branding: siembra el logo oficial o migra documentos heredados (con respaldo)
      ensureBrandingIntegrity();

      const handleRateRequest = async (_req: any, res: any) => {
        try {
          const reqUrl = new URL(_req.url || '', `http://${_req.headers.host || 'localhost:3000'}`);
          const simParam = reqUrl.searchParams.get('simulateRate') || reqUrl.searchParams.get('testRate');
          const overrideRate = simParam ? parseFloat(simParam) : undefined;

          const result = await fetchBCVRate(overrideRate ? 'AUDIT_SUITE' : 'HTTP_MANUAL', overrideRate);
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              success: result.success,
              rate: result.rateUSD_VES,
              date: result.date,
              source: result.source,
              timestamp: result.timestamp,
              method: result.method,
            })
          );
        } catch (err: any) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              success: false,
              error: err.message,
            })
          );
        }
      };

      // Middleware para Cloud Function createUserAccount con validación de Custom Claims SUPERADMIN
      server.middlewares.use('/api/createUserAccount', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
          return;
        }

        let bodyData = '';
        req.on('data', (chunk: any) => {
          bodyData += chunk;
        });

        req.on('end', async () => {
          try {
            const parsed = bodyData ? JSON.parse(bodyData) : {};
            const authHeader = req.headers['authorization'] || '';
            const result = await createUserAccountHandler(parsed, authHeader);
            res.statusCode = result.success ? 200 : 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
      });

      // Middleware para listar cuentas de usuario aprovisionadas (SSoT Backend)
      server.middlewares.use('/api/listUsers', async (_req: any, res: any) => {
        try {
          const result = await listUsersHandler();
          res.statusCode = result.success ? 200 : 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (e: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });

      // Middleware para Cloud Function askGeminiAssistant
      server.middlewares.use('/api/askGeminiAssistant', async (req: any, res: any) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
          return;
        }

        let bodyData = '';
        req.on('data', (chunk: any) => {
          bodyData += chunk;
        });

        req.on('end', async () => {
          try {
            const parsed = bodyData ? JSON.parse(bodyData) : {};
            const result = await askGeminiAssistantHandler(parsed);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, reply: '¡Hola! Estoy atenta en el sistema para ayudarte con tus tareas de granja, pesajes y registros operativos. ¿Qué labor deseas consultar?' }));
          }
        });
      });

      // Middleware para actualización del logotipo corporativo (solo SUPERADMIN con ID Token verificado)
      server.middlewares.use('/api/uploadLogo', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
          return;
        }

        let bodyData = '';
        req.on('data', (chunk: any) => {
          bodyData += chunk;
        });

        req.on('end', async () => {
          try {
            const parsed = bodyData ? JSON.parse(bodyData) : {};
            const authHeader = req.headers['authorization'] || '';
            const result = await uploadLogoHandler(parsed, authHeader);
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
      });

      // Middleware para restaurar el logotipo oficial (solo SUPERADMIN con ID Token verificado)
      server.middlewares.use('/api/resetLogo', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Method Not Allowed' }));
          return;
        }
        try {
          const authHeader = req.headers['authorization'] || '';
          const result = await resetLogoHandler(authHeader);
          res.statusCode = result.status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(result));
        } catch (e: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });

      // Middleware de lectura pública del logotipo (respaldo cuando Firestore cliente no está disponible)
      server.middlewares.use('/api/getBranding', async (_req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        try {
          const result = await getBrandingHandler();
          res.end(JSON.stringify(result));
        } catch {
          res.end(JSON.stringify({ success: true, logoUrl: '/puro_apure_logo.png', isCustom: false, version: 0 }));
        }
      });

      // Exponer endpoint oficial de la Cloud Function fetchBCVRate y su alias
      server.middlewares.use('/api/fetchBCVRate', handleRateRequest);
      server.middlewares.use('/api/sync-bcv', handleRateRequest);

      // WhatsApp QR Bridge Middlewares
      server.middlewares.use('/api/whatsapp/status', async (req: any, res: any) => {
        const reqUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost:3000'}`);
        const lineaId = reqUrl.searchParams.get('lineaId') || 'linea_cobranzas';
        const status = await getWhatsAppLineStatusHandler(lineaId);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, ...status }));
      });

      server.middlewares.use('/api/whatsapp/qr', async (req: any, res: any) => {
        const reqUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost:3000'}`);
        const lineaId = reqUrl.searchParams.get('lineaId') || 'linea_cobranzas';
        const qr = await generateQrCodeHandler(lineaId);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, ...qr }));
      });

      server.middlewares.use('/api/whatsapp/pair', async (req: any, res: any) => {
        let body = '';
        req.on('data', (chunk: any) => (body += chunk));
        req.on('end', async () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            const result = await confirmPairingHandler(parsed.lineaId || 'linea_cobranzas', parsed.phone || '');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, ...result }));
          } catch (e: any) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      bcvServerProxyPlugin(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'puro_apure_logo.png'],
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallbackDenylist: [/^\/api/],
          runtimeCaching: [
            {
              // Aislamiento dinámico de APIs (Mitigación VEC-PWA-03): Red con respaldo de caché
              // (excluye chat en vivo y endpoints de branding para no servir logotipos obsoletos)
              urlPattern: /\/api\/(?!askGeminiAssistant|getBranding|uploadLogo|resetLogo).*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-dynamic-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24, // 24 horas
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
        },
        manifest: {
          name: 'Puro Apure ERP - Sistema de Gestión Agroindustrial',
          short_name: 'Puro Apure ERP',
          description: 'Sistema ERP Agroindustrial Puro Apure Offline-First bimonetario con sincronización y trazabilidad.',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/puro_apure_logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'Trazabilidad & Lotes',
              short_name: 'Lotes',
              description: 'Gestión de biomasa avícola y porcina',
              url: '/#inventarios',
              icons: [{ src: '/icon.svg', sizes: 'any' }],
            },
            {
              name: 'Facturación Proforma',
              short_name: 'Facturas',
              description: 'Emisión de proformas bimonetarias BCV',
              url: '/#finanzas',
              icons: [{ src: '/icon.svg', sizes: 'any' }],
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.'),
      },
    },
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      'process.env.NEXT_PUBLIC_FIREBASE_API_KEY': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ''),
      'process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || ''),
      'process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ''),
      'process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || ''),
      'process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || ''),
      'process.env.NEXT_PUBLIC_FIREBASE_APP_ID': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_APP_ID || ''),
      'process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID': JSON.stringify(process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID || ''),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
