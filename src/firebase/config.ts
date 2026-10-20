import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  getFirestore,
  Firestore,
  setLogLevel,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import firebaseAppletConfig from '../../firebase-applet-config.json';

// Configure log level to suppress routine offline-fallback connection notices
setLogLevel('silent');

// Suprimir avisos rutinarios de conexión fuera de línea del SDK de Firestore en entornos embebidos/sandboxes
if (typeof window !== 'undefined' && window.console) {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const firstArg = typeof args[0] === 'string' ? args[0] : '';
    if (
      firstArg.includes('Could not reach Cloud Firestore backend') ||
      firstArg.includes('@firebase/firestore') ||
      firstArg.includes('The client will operate in offline mode')
    ) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

/**
 * Detección de Entorno Restrictivo para IndexedDB (Mitigación VEC-DB-02)
 * Evalúa WebKit/Safari, dispositivos iOS o entornos con restricciones de almacenamiento (Modo Incógnito)
 * para evitar interbloqueos de E/S multi-pestaña en el motor WebKit.
 */
export function isRestrictiveStorageEnvironment(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const ua = navigator.userAgent || '';

  // 1. Detección de Safari / WebKit en iOS o macOS
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isWebKit = /WebKit/i.test(ua);
  const isSafari =
    isWebKit &&
    /Safari/i.test(ua) &&
    !/Chrome|CriOS|Edg|Android|OPR|Firefox/i.test(ua);

  if (isIOS || isSafari) {
    return true;
  }

  // 2. Heurística de Modo Incógnito o Storage API restringido
  try {
    if (!window.indexedDB) {
      return true;
    }
    const testKey = '__puro_apure_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
  } catch {
    // SecurityError o QuotaExceededError común en Modo Incógnito estricto
    return true;
  }

  return false;
}

// 1. Refactorización del Objeto de Configuración con prefijo estricto NEXT_PUBLIC_ y fallback seguro
export const firebaseConfig = {
  apiKey:
    (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_FIREBASE_API_KEY : '') ||
    (typeof import.meta !== 'undefined' && (import.meta as Record<string, any>).env
      ? (import.meta as Record<string, any>).env.NEXT_PUBLIC_FIREBASE_API_KEY
      : '') ||
    firebaseAppletConfig?.apiKey ||
    '',
  authDomain:
    (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN : '') ||
    (typeof import.meta !== 'undefined' && (import.meta as Record<string, any>).env
      ? (import.meta as Record<string, any>).env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
      : '') ||
    firebaseAppletConfig?.authDomain ||
    '',
  projectId:
    (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID : '') ||
    (typeof import.meta !== 'undefined' && (import.meta as Record<string, any>).env
      ? (import.meta as Record<string, any>).env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      : '') ||
    firebaseAppletConfig?.projectId ||
    '',
  storageBucket: (() => {
    const rawBucket =
      (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET : '') ||
      (typeof import.meta !== 'undefined' && (import.meta as Record<string, any>).env
        ? (import.meta as Record<string, any>).env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
        : '') ||
      firebaseAppletConfig?.storageBucket ||
      '';
    // Saneamiento de formato: remover prefijos protocolarios gs:// o https:// y espacios
    const cleaned = rawBucket.replace(/^(gs:\/\/|https?:\/\/)/, '').replace(/\/.*$/, '').trim();
    if (!cleaned && firebaseAppletConfig?.projectId) {
      return `${firebaseAppletConfig.projectId}.firebasestorage.app`;
    }
    return cleaned;
  })(),
  messagingSenderId:
    (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID : '') ||
    (typeof import.meta !== 'undefined' && (import.meta as Record<string, any>).env
      ? (import.meta as Record<string, any>).env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
      : '') ||
    firebaseAppletConfig?.messagingSenderId ||
    '',
  appId:
    (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_FIREBASE_APP_ID : '') ||
    (typeof import.meta !== 'undefined' && (import.meta as Record<string, any>).env
      ? (import.meta as Record<string, any>).env.NEXT_PUBLIC_FIREBASE_APP_ID
      : '') ||
    firebaseAppletConfig?.appId ||
    '',
  firestoreDatabaseId:
    (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID : '') ||
    (typeof import.meta !== 'undefined' && (import.meta as Record<string, any>).env
      ? (import.meta as Record<string, any>).env.NEXT_PUBLIC_FIREBASE_FIRESTORE_DATABASE_ID
      : '') ||
    firebaseAppletConfig?.firestoreDatabaseId ||
    '(default)',
};

// 2. Validación de Inicialización Segura
export const isFirebaseConfigValid: boolean = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.apiKey.trim().length > 0 &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId.trim().length > 0
);

let app: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let storageInstance: FirebaseStorage | null = null;

if (!isFirebaseConfigValid) {
  console.warn(
    'Aviso DevSecOps: Configure NEXT_PUBLIC_FIREBASE_API_KEY en los secretos/variables de entorno para inicialización completa.'
  );
} else {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

    // Initialize Firestore with adaptive IndexedDB persistence cache for offline-first resilience (VEC-DB-02)
    try {
      const isRestrictive = isRestrictiveStorageEnvironment();
      const tabManager = isRestrictive
        ? persistentSingleTabManager({})
        : persistentMultipleTabManager();

      if (isRestrictive) {
        console.info(
          '[Firestore DevSecOps] Entorno restrictivo detectado (Safari/iOS/Incognito). Aplicando persistentSingleTabManager para mitigar bloqueos de E/S (VEC-DB-02).'
        );
      } else {
        console.info(
          '[Firestore DevSecOps] Entorno estándar detectado. Aplicando persistentMultipleTabManager para concurrencia multi-pestaña.'
        );
      }

      firestoreInstance = initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({
            tabManager,
            cacheSizeBytes: 50 * 1024 * 1024, // 50MB bounded cache con recolección de basura LRU activa
          }),
          experimentalForceLongPolling: true,
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch (e) {
      console.warn('Persistent local cache initialization fallback:', e);
      firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }

    // Auto-recuperación si la instancia existente se encontraba terminada
    if (
      firestoreInstance &&
      (firestoreInstance as any)._terminateTask &&
      (firestoreInstance as any)._terminateTask !== 'notTerminated'
    ) {
      firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }

    authInstance = getAuth(app);
    try {
      storageInstance = getStorage(app);
    } catch (storageErr) {
      console.warn('Firebase Storage no disponible:', storageErr);
    }
  } catch (initErr) {
    console.warn('Inicialización de Firebase SDK con fallback local:', initErr);
  }
}

export const db = firestoreInstance as Firestore;
export const auth = authInstance as Auth;
export const storage = storageInstance as FirebaseStorage;

/**
 * Operación segura de cierre de sesión para Firestore SDK en entornos SPA.
 * En arquitecturas SPA (Single Page Application), la instancia compartida de Firestore (db)
 * no debe destruirse con terminate() durante el cierre de sesión para evitar
 * excepciones no controladas "FirebaseError: The client has already been terminated"
 * en observadores en segundo plano y en la pantalla de inicio de sesión (/login).
 */
export async function terminateFirestoreInstance(): Promise<void> {
  // Safe no-op en runtime SPA para garantizar la resiliencia del cliente Firestore singleton
  return Promise.resolve();
}

// Strict Error Handling mandated by Firebase Integration Skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = auth ? auth.currentUser : null;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid || null,
      email: currentUser?.email || null,
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || null,
      tenantId: currentUser?.tenantId || null,
      providerInfo:
        currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
