/**
 * One-Time Provisioning Script: init-root-user.js
 * Inyecta vía Firebase Admin SDK al Superadministrador inmutable "Ruben Rojas"
 * con correo rdrj.mppd@gmail.com y clave 102030, asignando el Custom Claim de SUPERADMIN.
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

let serviceAccount = null;
try {
  const keyPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(keyPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
  }
} catch (e) {
  console.warn('Advertencia al leer serviceAccountKey.json:', e);
}

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || 'puro-apure-erp',
    });
  } else {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'puro-apure-erp',
    });
  }
}

const auth = admin.auth();
const db = admin.firestore();

const ROOT_USER_CONFIG = {
  uid: 'superadmin_ruben_rojas',
  email: 'rdrj.mppd@gmail.com',
  password: '102030',
  displayName: 'Ruben Rojas',
  emailVerified: true,
  role: 'SUPERADMIN',
  adminPin: '1020', // PIN de 4 dígitos para autorización de operaciones críticas
};

async function provisionRootUser() {
  console.log('==================================================');
  console.log('[AgroERP DevSecOps] Ejecutando One-Time Provisioning de Superadministrador...');
  console.log('==================================================');

  let userRecord;
  try {
    // 1. Verificar si el usuario ya existe por email
    try {
      userRecord = await auth.getUserByEmail(ROOT_USER_CONFIG.email);
      console.log(`[INFO] Usuario root existente encontrado (UID: ${userRecord.uid}). Actualizando perfil...`);
      userRecord = await auth.updateUser(userRecord.uid, {
        password: ROOT_USER_CONFIG.password,
        displayName: ROOT_USER_CONFIG.displayName,
        emailVerified: true,
      });
    } catch (notFoundError) {
      if (notFoundError.code === 'auth/user-not-found') {
        console.log('[INFO] Creando nuevo Superadministrador en Firebase Auth...');
        userRecord = await auth.createUser({
          uid: ROOT_USER_CONFIG.uid,
          email: ROOT_USER_CONFIG.email,
          password: ROOT_USER_CONFIG.password,
          displayName: ROOT_USER_CONFIG.displayName,
          emailVerified: true,
        });
      } else {
        throw notFoundError;
      }
    }

    // 2. Asignar Custom Claim inmutable SUPERADMIN
    console.log('[SECURITY] Asignando Custom Claims { role: "SUPERADMIN", isSuperAdmin: true }...');
    await auth.setCustomUserClaims(userRecord.uid, {
      role: 'SUPERADMIN',
      isSuperAdmin: true,
      accessTier: 'TIER_1_ROOT',
      pinProtected: true,
    });

    // 3. Crear / Actualizar documento en Firestore /users/{uid}
    const userDocRef = db.collection('users').doc(userRecord.uid);
    await userDocRef.set(
      {
        uid: userRecord.uid,
        email: ROOT_USER_CONFIG.email,
        displayName: ROOT_USER_CONFIG.displayName,
        role: 'SUPERADMIN',
        adminPinHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // SHA-256 de '1020'
        isImmutableRoot: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log('--------------------------------------------------');
    console.log('✓ SUPERADMIN PROVISIONADO CON ÉXITO:');
    console.log(`  - Nombre: ${ROOT_USER_CONFIG.displayName}`);
    console.log(`  - Correo: ${ROOT_USER_CONFIG.email}`);
    console.log(`  - Password: ${ROOT_USER_CONFIG.password}`);
    console.log(`  - Rol / Claim: SUPERADMIN`);
    console.log(`  - PIN 4 Dígitos: ${ROOT_USER_CONFIG.adminPin}`);
    console.log('==================================================');
  } catch (err) {
    console.error('[ERROR CRÍTICO] Falló el aprovisionamiento root:', err);
    process.exit(1);
  }
}

provisionRootUser();
