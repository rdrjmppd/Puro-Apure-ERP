/**
 * Backend Core: Firebase Admin SDK Initializer
 * Proporciona autoridad administrativa Root para Firebase Authentication y Cloud Firestore en el servidor.
 */

import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let serviceAccount: any = null;
try {
  const keyPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(keyPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
  }
} catch (err) {
  console.warn('[Firebase Admin] Advertencia al leer serviceAccountKey.json:', err);
}

// Bandera DevSecOps: Determina si el entorno cuenta con credenciales administrativas para llamadas gRPC
export const hasAdminCredentials = Boolean(
  serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS
);

let configJson: any = null;
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    configJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch {}

const targetProjectId =
  serviceAccount?.project_id ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  configJson?.projectId ||
  'puro-apure-erp';

export const adminApp =
  getApps().length > 0
    ? getApp()
    : initializeApp(
        serviceAccount
          ? {
              credential: cert(serviceAccount),
              projectId: targetProjectId,
            }
          : {
              projectId: targetProjectId,
            }
      );

export const adminAuth = getAuth(adminApp);

const targetDbId =
  process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID ||
  configJson?.firestoreDatabaseId;

export const adminDb =
  targetDbId && targetDbId !== '(default)'
    ? getFirestore(adminApp, targetDbId)
    : getFirestore(adminApp);

// Configuración DevSecOps: ignorar propiedades undefined en escrituras del servidor
adminDb.settings({ ignoreUndefinedProperties: true });

export { FieldValue };

// Fachada administrativa universal para endpoints y handlers del servidor
export const admin = {
  app: adminApp,
  auth: () => adminAuth,
  firestore: Object.assign(
    () => adminDb,
    { FieldValue }
  ),
};

export default admin;
