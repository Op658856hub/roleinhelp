// ===========================================
// History & Processed Message Manager
// Ensures no question is answered twice,
// and catches up on unanswered questions from the last 24h.
// ===========================================

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

const PROCESSED_FILE = path.join(__dirname, '..', '..', 'data', 'processed_messages.json');
const MAX_HISTORY_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days retention

let processedMessages = {};

/**
 * Load processed message history from disk
 */
function loadHistory() {
    try {
        const dir = path.dirname(PROCESSED_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (fs.existsSync(PROCESSED_FILE)) {
            const data = fs.readFileSync(PROCESSED_FILE, 'utf-8');
            processedMessages = JSON.parse(data);
            cleanOldRecords();
        } else {
            processedMessages = {};
            saveHistory();
        }
    } catch (error) {
        logger.error(`Failed to load processed messages history: ${error.message}`);
        processedMessages = {};
    }
}

/**
 * Save processed message history to disk
 */
function saveHistory() {
    try {
        fs.writeFileSync(PROCESSED_FILE, JSON.stringify(processedMessages, null, 2));
    } catch (error) {
        logger.error(`Failed to save processed messages history: ${error.message}`);
    }
}

/**
 * Clean records older than 7 days to prevent file bloat
 */
function cleanOldRecords() {
    const now = Date.now();
    let modified = false;
    for (const [id, record] of Object.entries(processedMessages)) {
        if (now - record.timestamp > RETENTION_MS) {
            delete processedMessages[id];
            modified = true;
        }
    }
    if (modified) {
        saveHistory();
    }
}

/**
 * Check if a message was already processed/answered
 * @param {string} messageId 
 * @returns {boolean}
 */
function isMessageProcessed(messageId) {
    return !!processedMessages[messageId];
}

/**
 * Mark a message as processed
 * @param {string} messageId 
 * @param {object} metadata 
 */
function markMessageProcessed(messageId, metadata = {}) {
    processedMessages[messageId] = {
        timestamp: Date.now(),
        ...metadata
    };
    saveHistory();
}

/**
 * Scan recent chats for questions that were asked while bot was offline (up to 24h ago)
 * Includes graceful waiting & retry for WhatsApp Web chat store initialization.
 * @param {Client} client 
 * @param {Function} handleMessageFn 
 */
async function syncOfflineMessages(client, handleMessageFn) {
    try {
        logger.info('🔍 Memeriksa pertanyaan yang masuk selama bot offline (24 jam terakhir)...');
        
        let chats = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                chats = await client.getChats();
                if (chats && Array.isArray(chats)) break;
            } catch (err) {
                if (attempt < 3) {
                    logger.info(`⏳ Menunggu sinkronisasi chat WhatsApp Web (percobaan ${attempt}/3)...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }
        
        if (!chats || !Array.isArray(chats)) {
            logger.info('👌 Sinkronisasi pesan offline selesai. Op65-Agent standby menerima pesan baru secara real-time!');
            return;
        }

        const now = Date.now();
        let pendingCount = 0;
        
        for (const chat of chats) {
            // Only inspect chats with recent activity (within 24h)
            const lastMsgTimestamp = chat.lastMessage ? chat.lastMessage.timestamp * 1000 : 0;
            if (lastMsgTimestamp && (now - lastMsgTimestamp > MAX_HISTORY_AGE_MS)) {
                continue;
            }
            
            try {
                // Fetch recent messages in this chat
                const messages = await chat.fetchMessages({ limit: 40 });
                
                for (let i = 0; i < messages.length; i++) {
                    const msg = messages[i];
                    const msgAge = now - (msg.timestamp * 1000);
                    
                    // Skip if older than 24 hours
                    if (msgAge > MAX_HISTORY_AGE_MS) continue;
                    
                    // Skip messages sent by the bot itself
                    if (msg.fromMe) continue;
                    
                    const body = msg.body?.trim();
                    if (!body && !msg.hasMedia) continue;
                    
                    const lowerBody = (body || '').toLowerCase();
                    const isCommand = lowerBody.startsWith('!op65');
                    const isMentionBot = lowerBody.includes('op65') || lowerBody.includes('@op65');
                    
                    if (!isCommand && !isMentionBot) continue;
                    
                    const messageId = msg.id._serialized || msg.id.id;
                    
                    // If already recorded in database, skip
                    if (isMessageProcessed(messageId)) continue;
                    
                    // Extra safety: Check if there was already a response from the bot AFTER this message
                    const subsequentMsgs = messages.slice(i + 1);
                    const alreadyAnsweredInChat = subsequentMsgs.some(nextMsg => 
                        nextMsg.fromMe && 
                        (nextMsg.hasQuotedMsg ? nextMsg.quotedMsgId === messageId : false)
                    );
                    
                    if (alreadyAnsweredInChat) {
                        markMessageProcessed(messageId, { autoDetectedAnswered: true });
                        continue;
                    }
                    
                    // This message was genuinely NOT answered!
                    pendingCount++;
                    logger.info(`⚡ Menjawab pertanyaan tertunda dari ${msg.author || msg.from} (ID: ${messageId})`);
                    
                    // Process message
                    await handleMessageFn(client, msg);
                    
                    // Small delay between answers to prevent rate-limit
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            } catch (chatError) {
                // Ignore specific chat fetch error and continue to other chats
            }
        }
        
        if (pendingCount > 0) {
            logger.info(`✅ Berhasil menjawab ${pendingCount} pertanyaan tertunda yang masuk saat bot offline!`);
        } else {
            logger.info('👌 Semua pertanyaan 24 jam terakhir sudah terjawab / tidak ada yang tertunda.');
        }
    } catch (error) {
        logger.info(`ℹ️ Sinkronisasi chat offline dilewati. Bot siap menerima pesan baru secara real-time!`);
    }
}

module.exports = {
    loadHistory,
    isMessageProcessed,
    markMessageProcessed,
    syncOfflineMessages
};
