// ===========================================
// Op65-Agent - Main Entry Point
// WhatsApp AI Academic Assistant
// Created by: Livelyhood Tonggo Tua Sinaga
// ===========================================

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { handleMessage } = require('./handlers/messageHandler');
const { logger } = require('./utils/logger');
const { loadContacts } = require('./services/contactManager');
const { loadHistory, syncOfflineMessages } = require('./services/historyManager');
const { startServer } = require('./apiServer');

// Start Op65 HTTP API Server for RoleInHelp Web UI
startServer();

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu'
        ]
    }
});

// QR Code Event
client.on('qr', (qr) => {
    logger.info('🔲 Scan QR Code di bawah ini pake WhatsApp lo:');
    qrcode.generate(qr, { small: true });
});

// Authenticated
client.on('authenticated', () => {
    logger.info('🔐 Authenticated successfully! Sesi WhatsApp tersambung.');
});

// Loading screen
client.on('loading_screen', (percent, message) => {
    logger.info(`⏳ Loading WhatsApp Web: ${percent}% - ${message}`);
});

// Ready Event
client.on('ready', async () => {
    logger.info('='.repeat(50));
    logger.info('🤖 Op65-Agent ONLINE dan siap tempur!');
    logger.info(`📋 Bot Name: ${process.env.BOT_NAME || 'Op65-Agent'}`);
    logger.info(`👤 Owner: ${process.env.OWNER_NAME || 'Livelyhood Tonggo Tua Sinaga'}`);
    logger.info('='.repeat(50));
    
    // Load saved contacts & history
    loadContacts();
    loadHistory();
    
    // Auto-Catchup: Periksa dan jawab pesan 24 jam terakhir yang tertunda saat offline
    // Dijalankan di background setelah jeda 10 detik agar sinkronisasi internal WhatsApp Web (0% -> 99%) tuntas
    setTimeout(async () => {
        try {
            await syncOfflineMessages(client, handleMessage);
        } catch (err) {
            logger.info('ℹ️ Sinkronisasi offline dilewati. Bot siap menerima pesan baru secara real-time!');
        }
    }, 10000);
});

// Message Event (using message_create to ensure no group messages are missed)
client.on('message_create', async (msg) => {
    try {
        await handleMessage(client, msg);
    } catch (error) {
        logger.error(`Error handling message: ${error.message}`);
    }
});

// Auth failure
client.on('auth_failure', (msg) => {
    logger.error(`Authentication failed: ${msg}`);
});

// Disconnected
client.on('disconnected', (reason) => {
    logger.warn(`Client disconnected: ${reason}`);
    logger.info('Attempting to reconnect...');
    client.initialize();
});

// Start the bot
logger.info('🚀 Starting Op65-Agent...');
client.initialize();
