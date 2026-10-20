/**
 * Script de Saneamiento y Borrado Masivo: purge-test-users.js
 * Purga del entorno cualquier cuenta o documento de prueba, garantizando
 * que la única entidad con persistencia sea el Superadministrador "Ruben Rojas" (rdrj.mppd@gmail.com).
 */

import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'agroerp-pro-bimonetario',
    });
  } catch {
    admin.initializeApp();
  }
}

const auth = admin.auth();
const db = admin.firestore();

const PROTECTED_ROOT_EMAIL = 'rdrj.mppd@gmail.com';

async function purgeTestUsers() {
  console.log('==================================================');
  console.log('[AgroERP Saneamiento Root] Iniciando purga masiva de entidades de prueba...');
  console.log('==================================================');

  let deletedAuthUsersCount = 0;
  let deletedFirestoreUsersCount = 0;

  try {
    // 1. Purgar usuarios en Firebase Auth
    let pageToken;
    do {
      const listUsersResult = await auth.listUsers(100, pageToken);
      for (const user of listUsersResult.users) {
        if (user.email?.toLowerCase() !== PROTECTED_ROOT_EMAIL.toLowerCase()) {
          console.log(`[PURGE AUTH] Eliminando usuario de prueba: ${user.email} (UID: ${user.uid})`);
          await auth.deleteUser(user.uid);
          deletedAuthUsersCount++;
        } else {
          console.log(`[PROTECTED] Preservando identidad de Superadministrador: ${user.email}`);
        }
      }
      pageToken = listUsersResult.pageToken;
    } while (pageToken);

    // 2. Purgar documentos en colección Firestore /users
    const usersSnapshot = await db.collection('users').get();
    const batch = db.batch();

    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.email?.toLowerCase() !== PROTECTED_ROOT_EMAIL.toLowerCase()) {
        console.log(`[PURGE FIRESTORE] Eliminando registro de prueba en Firestore: ${doc.id} (${data.email})`);
        batch.delete(doc.ref);
        deletedFirestoreUsersCount++;
      }
    });

    if (deletedFirestoreUsersCount > 0) {
      await batch.commit();
    }

    console.log('--------------------------------------------------');
    console.log('✓ SANEAMIENTO FINALIZADO CON ÉXITO:');
    console.log(`  - Usuarios de prueba purgados en Firebase Auth: ${deletedAuthUsersCount}`);
    console.log(`  - Documentos purgados en Firestore /users: ${deletedFirestoreUsersCount}`);
    console.log(`  - Única identidad activa: ${PROTECTED_ROOT_EMAIL} (SUPERADMIN)`);
    console.log('==================================================');
  } catch (error) {
    console.error('[ERROR SANEAMIENTO] Ocurrió un error al purgar usuarios:', error);
    process.exit(1);
  }
}

purgeTestUsers();
