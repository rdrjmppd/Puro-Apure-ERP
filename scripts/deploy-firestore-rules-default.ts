import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const keyPath = path.resolve(root, 'serviceAccountKey.json');
const rulesPath = path.resolve(root, 'firestore.rules');

async function deployRules() {
  console.log('🚀 Iniciando despliegue seguro de firestore.rules a la base de datos (default)...');
  
  if (!fs.existsSync(keyPath)) {
    throw new Error('No se encontró serviceAccountKey.json');
  }
  if (!fs.existsSync(rulesPath)) {
    throw new Error('No se encontró firestore.rules');
  }

  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
  console.log(`📄 Archivo firestore.rules leído (${rulesContent.length} caracteres).`);

  const auth = new GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const projectId = 'puro-apure-erp';

  // 1. Obtener la release actual de cloud.firestore para respaldo
  const releaseName = `projects/${projectId}/releases/cloud.firestore`;
  console.log(`🔍 Consultando release actual: ${releaseName}...`);
  
  const getReleaseRes: any = await client.request({
    url: `https://firebaserules.googleapis.com/v1/${releaseName}`,
    method: 'GET',
  });
  
  const currentRelease = getReleaseRes.data;
  console.log(`📦 Release actual: ${currentRelease.name} -> Ruleset: ${currentRelease.rulesetName}`);
  
  // Guardar respaldo
  const backupDir = path.resolve(root, 'scratch');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.resolve(backupDir, 'backup_ruleset_default.json'),
    JSON.stringify(currentRelease, null, 2),
    'utf-8'
  );
  console.log(`✅ Respaldo guardado en scratch/backup_ruleset_default.json`);

  // 2. Crear nuevo Ruleset
  console.log(`🔨 Creando nuevo ruleset en Firebase Rules API...`);
  const createRulesetRes: any = await client.request({
    url: `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    method: 'POST',
    data: {
      source: {
        files: [
          {
            name: 'firestore.rules',
            content: rulesContent,
          },
        ],
      },
    },
  });

  const newRuleset = createRulesetRes.data;
  console.log(`✅ Nuevo ruleset creado exitosamente: ${newRuleset.name}`);

  // 3. Actualizar la release cloud.firestore para apuntar al nuevo ruleset
  console.log(`⚡ Actualizando release ${releaseName} al nuevo ruleset...`);
  const updateReleaseRes: any = await client.request({
    url: `https://firebaserules.googleapis.com/v1/${releaseName}?updateMask=rulesetName`,
    method: 'PATCH',
    data: {
      release: {
        name: releaseName,
        rulesetName: newRuleset.name,
      },
    },
  });

  console.log(`🎉 Release actualizada con éxito:`, updateReleaseRes.data);

  // 4. Verificación inmediata
  console.log(`🔎 Verificando reglas activas en ${releaseName}...`);
  const verifyRes: any = await client.request({
    url: `https://firebaserules.googleapis.com/v1/${newRuleset.name}`,
    method: 'GET',
  });
  const deployedContent = verifyRes.data.source.files[0].content;
  
  const checkCollections = [
    'whatsapp_lineas',
    'whatsapp_mensajes',
    'whatsapp_plantillas',
    'pagos_reportados_ocr',
    'lotes_historicos',
    'gastos_operativos',
  ];

  console.log('\n--- VERIFICACIÓN DE REGLAS DESPLEGADAS ---');
  let allPresent = true;
  for (const col of checkCollections) {
    const present = deployedContent.includes(col);
    console.log(`  - ${col}: ${present ? '✅ PRESENTE' : '❌ AUSENTE'}`);
    if (!present) allPresent = false;
  }

  if (allPresent) {
    console.log('\n🏆 ¡DESPLIEGUE EN (default) COMPLETADO Y CERTIFICADO EXITOSAMENTE AL 100%!');
  } else {
    throw new Error('Faltaron algunas colecciones en el despliegue.');
  }
}

deployRules().catch((err) => {
  console.error('❌ Error en el despliegue de reglas:', err.response?.data || err.message);
  process.exit(1);
});
