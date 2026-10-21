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

export const adminApp =
  getApps().length > 0
    ? getApp()
    : initializeApp(
        serviceAccount
          ? {
              credential: cert(serviceAccount),
              projectId: serviceAccount.project_id || 'puro-apure-erp',
            }
          : {
              projectId: 'puro-apure-erp',
            }
      );

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

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
