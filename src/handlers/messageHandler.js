// ===========================================
// Message Handler - Core Bot Logic
// Supports Universal User Memory across ALL groups & DMs,
// Multimodal Vision, Interruption-Proof English Academic Translation,
// and Academic Word Document (.docx) Generation.
// ===========================================

const { MessageMedia } = require('whatsapp-web.js');
const { getContact, registerContact, incrementQuestionCount, getAllContacts, removeContact, linkIdentifier } = require('../services/contactManager');
const { generateResponse, generateEnglishVersion } = require('../services/geminiService');
const { isMessageProcessed, markMessageProcessed } = require('../services/historyManager');
const { saveAnswer, resolveTargetAnswer } = require('../services/sessionManager');
const { generateAcademicWordDocument } = require('../services/wordService');
const { logger } = require('../utils/logger');

// Owner phone number (normalized)
const OWNER_PHONE = (process.env.OWNER_PHONE || '').replace(/[^0-9]/g, '');

// Command prefix
const PREFIX = process.env.BOT_PREFIX || '!op65';

/**
 * Extract all possible identifiers for the sender (LID, phone number, serialized ID, etc.)
 * Strictly isolates individual users from group chat IDs (@g.us).
 * Includes Fast-Path resolution for instant 0-delay response.
 * @param {Message} msg 
 * @returns {Promise<string[]>}
 */
async function extractUserIdentifiers(msg) {
    const ids = new Set();
    const isGroup = msg.from.endsWith('@g.us');
    
    // 1. Instant Fast-Path: In group msg.author is sender, in DM msg.from is sender
    const directSender = msg.author || (!isGroup ? msg.from : null);
    if (directSender && !directSender.includes('@g.us')) {
        ids.add(directSender);
        const digits = directSender.replace(/[^0-9]/g, '');
        if (digits && digits.length >= 9 && digits.length <= 15) {
            ids.add(digits);
        }
    }
    
    // 2. Fetch contact object with a strict 1.5s timeout so it NEVER lags the response
    try {
        const contactPromise = msg.getContact();
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 1500));
        const contact = await Promise.race([contactPromise, timeoutPromise]);
        
        if (contact) {
            if (contact.number) {
                ids.add(contact.number);
                ids.add(`${contact.number}@c.us`);
            }
            if (contact.id?._serialized && !contact.id._serialized.includes('@g.us')) {
                ids.add(contact.id._serialized);
            }
            if (contact.id?.user && !contact.id.user.includes('@g.us')) {
                ids.add(contact.id.user);
            }
        }
    } catch (e) {
        // Ignore contact fetch errors
    }

    // Always include clean phone digits
    for (const id of Array.from(ids)) {
        if (id.includes('@g.us') || id.includes('@broadcast')) {
            ids.delete(id);
            continue;
        }
        const digits = id.replace(/[^0-9]/g, '');
        if (digits && digits.length >= 9 && digits.length <= 15) {
            ids.add(digits);
        }
    }
    
    return Array.from(ids).filter(id => !id.includes('@g.us') && !id.includes('@broadcast'));
}

/**
 * Main message handler
 * @param {Client} client - WhatsApp client
 * @param {Message} msg - Incoming message
 */
async function handleMessage(client, msg) {
    // Ignore status broadcasts and own messages
    if (msg.from === 'status@broadcast') return;
    if (msg.fromMe) return;
    
    const body = msg.body?.trim() || '';
    
    // If neither text nor media is present, ignore
    if (!body && !msg.hasMedia) return;
    
    const isGroup = msg.from.endsWith('@g.us');
    const messageId = msg.id._serialized || msg.id.id;
    
    // Check if this message was already answered/processed
    if (isMessageProcessed(messageId)) {
        return;
    }
    
    // ========================================
    // COMMAND ROUTING
    // ========================================
    
    const lowerBody = body.toLowerCase();
    const isCommand = lowerBody.startsWith(PREFIX.toLowerCase());
    const isMentionBot = lowerBody.includes('op65') || lowerBody.includes('@op65');
    
    // Perintah khusus !english dan !word
    const isExplicitEnglishCommand = lowerBody === '!english' || lowerBody.startsWith('!english ') || lowerBody === '!eng';
    const isExplicitWordCommand = lowerBody === '!word' || lowerBody.startsWith('!word ') || lowerBody === '!doc' || lowerBody === '!docx';
    
    // BAIK DI GROUP MAUPUN DI DM: Hanya respon jika ada !op65, mention op65, !english, atau !word!
    if (!isCommand && !isMentionBot && !isExplicitEnglishCommand && !isExplicitWordCommand) {
        return;
    }
    
    // Resolve all sender identifiers (ensures universal user memory across groups)
    const identifiers = await extractUserIdentifiers(msg);
    const senderDisplay = identifiers[0] || msg.author || msg.from;
    
    logger.info(`📩 [${isGroup ? 'GROUP' : 'DM'}] Dari ${senderDisplay}: "${body.substring(0, 80)}"`);
    
    // Helper to send reply safely and return sent message for ID tracking
    const sendReply = async (text) => {
        try {
            return await msg.reply(text);
        } catch (err) {
            logger.warn(`msg.reply failed (${err.message}), fallback to sendMessage...`);
            return await client.sendMessage(msg.from, text);
        }
    };
    
    // Remove prefix from message if present
    let command = body;
    if (command.toLowerCase().startsWith(PREFIX.toLowerCase())) {
        command = command.substring(PREFIX.length).trim();
    }
    // Also strip "op65" mention
    command = command.replace(/^@?op65[\s,:]*/i, '').trim();
    
    const lowerCommand = command.toLowerCase();
    
    // ========================================
    // REGISTRATION & IDENTITY COMMANDS
    // ========================================
    
    // Check if user wants to register
    if (lowerCommand.startsWith('kenalan') || lowerCommand.startsWith('register') || lowerCommand.startsWith('daftar')) {
        await handleRegistration(msg, identifiers, command, sendReply, messageId);
        return;
    }
    
    // Help command
    if (lowerCommand === 'help' || lowerCommand === 'menu' || lowerCommand === 'bantuan') {
        await sendHelpMenu(sendReply);
        markMessageProcessed(messageId, { sender: senderDisplay, type: 'help' });
        return;
    }
    
    // Status command
    if (lowerCommand === 'status') {
        await sendReply('🤖 *Op65-Agent Status*\n✅ Online & Ready\n🧠 Powered by Gemini AI + Google Scholar + Direktori Putusan PN/MA\n👨‍💻 Created by Livelyhood Tonggo Tua Sinaga');
        markMessageProcessed(messageId, { sender: senderDisplay, type: 'status' });
        return;
    }
    
    // List contacts (owner only)
    if (lowerCommand === 'listcontacts' || lowerCommand === 'list contacts') {
        if (isOwner(identifiers)) {
            await handleListContacts(sendReply);
        } else {
            await sendReply('⛔ Command ini cuma bisa dipake sama owner, bro.');
        }
        markMessageProcessed(messageId, { sender: senderDisplay, type: 'listcontacts' });
        return;
    }
    
    // ========================================
    // IDENTITY CHECK (Must be registered)
    // ========================================
    
    const contact = getContact(identifiers);
    
    if (!contact) {
        // User is genuinely NOT registered anywhere - send the iconic rejection message
        logger.info(`🚫 Unknown user ${senderDisplay} requested help. Sending rejection.`);
        await sendReply(
            'Buset mpruyyy kenalan dulu atuh kita baru minta tolong 😤\n\n' +
            'Ketik:\n' +
            `*${PREFIX} kenalan [Nama] | [Universitas] | [Jurusan]*\n\n` +
            'Contoh:\n' +
            `*${PREFIX} kenalan Budi Santoso | President University | Hukum*`
        );
        markMessageProcessed(messageId, { sender: senderDisplay, type: 'rejection' });
        return;
    }
    
    // Link any alternate identifier to this known contact
    for (const id of identifiers) {
        linkIdentifier(contact.key, id);
    }
    
    // ========================================
    // WORD DOCUMENT GENERATION REQUEST (!word)
    // ========================================
    
    const isWordRequest = isExplicitWordCommand || 
                          lowerCommand === 'word' || 
                          lowerCommand === 'doc' || 
                          lowerCommand === 'docx' ||
                          lowerCommand.startsWith('word');
                          
    if (isWordRequest) {
        markMessageProcessed(messageId, { sender: senderDisplay, type: 'word_request' });
        
        // Inspect if user quoted/replied to a specific message in the group
        let quotedMessageId = null;
        let quotedBody = null;
        if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted) {
                    quotedMessageId = quoted.id?._serialized || quoted.id?.id;
                    quotedBody = quoted.body;
                }
            } catch (e) {
                // Ignore quoted fetch error
            }
        }
        
        const targetSession = resolveTargetAnswer({
            userKey: contact.key,
            quotedMessageId,
            quotedBody
        });
        
        if (!targetSession) {
            await sendReply(`Eh ${contact.name}, lo belum pernah nanya soal sebelumnya nih (atau lo belum kutip jawaban mana yang mau dibuatkan Word). Tanya soal dulu ya, baru bisa gue generate file Word (.docx)-nya! 😄\n\nKetik: *${PREFIX} [pertanyaan kamu]*`);
            return;
        }
        
        const questionSnippet = targetSession.question.length > 60 
            ? targetSession.question.substring(0, 60) + '...' 
            : targetSession.question;
            
        await sendReply(`⏳ Siaaap ${contact.name}, gue susun dan format dokumen Word (.docx) resmi akademis lo dulu ya (Times New Roman 12, Judul & Sub-judul 14 Bold, Margin 4-4-3-3)... 📄✨`);
        
        try {
            const { filePath, fileName } = await generateAcademicWordDocument({
                question: targetSession.question,
                answer: targetSession.answer,
                userName: contact.name,
                university: contact.university,
                faculty: contact.faculty,
                isEnglish: targetSession.isEnglish || false
            });
            
            const media = MessageMedia.fromFilePath(filePath);
            await client.sendMessage(msg.from, media, {
                caption: `📄 *DOKUMEN RESMI KAJIAN AKADEMIS HUKUM (.DOCX)*\n━━━━━━━━━━━━━━━━━━━━━\n👤 *Mahasiswa:* ${contact.name} (${contact.university || 'President University'})\n📌 *Topik:* "${questionSnippet}"\n\n✅ *Font:* Times New Roman Size 12 pt (Justified, Spasi 1.5)\n✅ *Judul & Sub-judul:* Size 14 pt BOLD\n✅ *Margin Kertas:* Standar Skripsi/Paper 4-4-3-3 (Top 3cm, Left 4cm, Bottom 3cm, Right 3cm)\n\n💪 Tinggal cetak atau kumpul ke dosen bro! - Op65-Agent`
            });
            
            logger.info(`✅ Successfully sent Word document to ${contact.name} (${fileName})`);
        } catch (err) {
            logger.error(`Failed to generate and send Word document: ${err.message}`);
            await sendReply(`⚠️ Maaf ${contact.name}, gagal membuat file Word tadi (${err.message}). Coba ketik *!word* sekali lagi ya bro!`);
        }
        return;
    }
    
    // ========================================
    // ENGLISH ACADEMIC VERSION REQUEST (!english)
    // ========================================
    
    const isEnglishRequest = isExplicitEnglishCommand || 
                             lowerCommand === 'english' || 
                             lowerCommand.startsWith('english');
    
    if (isEnglishRequest) {
        markMessageProcessed(messageId, { sender: senderDisplay, type: 'english_request' });
        
        // Inspect if user quoted/replied to a specific message in the group
        let quotedMessageId = null;
        let quotedBody = null;
        if (msg.hasQuotedMsg) {
            try {
                const quoted = await msg.getQuotedMessage();
                if (quoted) {
                    quotedMessageId = quoted.id?._serialized || quoted.id?.id;
                    quotedBody = quoted.body;
                }
            } catch (e) {
                // Ignore quoted fetch error
            }
        }
        
        // Resolve target answer:
        // Prioritizes: 1) Quoted message ID, 2) Quoted content match, 3) User's personal last question (isolated from other members)
        const targetSession = resolveTargetAnswer({
            userKey: contact.key,
            quotedMessageId,
            quotedBody
        });
        
        if (!targetSession) {
            await sendReply(`Eh ${contact.name}, lo belum pernah nanya soal sebelumnya nih (atau lo belum kutip jawaban mana yang mau di-translate). Tanya soal dulu ya, baru bisa gue buatin versi English akademisnya! 😄\n\nKetik: *${PREFIX} [pertanyaan kamu]*`);
            return;
        }
        
        const questionSnippet = targetSession.question.length > 70 
            ? targetSession.question.substring(0, 70) + '...' 
            : targetSession.question;
            
        await sendReply(`⏳ Siaaap ${contact.name}, gue racik versi *Natural Academic English* untuk materi:\n📌 _"${questionSnippet}"_\nBiar pas buat tugas/paper PresUniv lo... 🇬🇧📚✨`);
        
        try {
            const englishVersion = await generateEnglishVersion(targetSession.question, targetSession.answer, contact.name);
            const englishReply = `🎓 *OP65-AGENT — ENGLISH ACADEMIC VERSION*\n━━━━━━━━━━━━━━━━━━━━━\n_Tailored for ${contact.name} (${contact.university || 'President University'})_\n📌 *Original Topic:* "${questionSnippet}"\n\n${englishVersion}\n\n━━━━━━━━━━━━━━━━━━━━━\n💡 *Mau versi Word (.docx) bahasa Inggris ini?*\nKetik perintah: 👉 *!word*\nBiar langsung gue kirimkan file Word siap cetak! 📄💪`;
            
            const sentEnglishMsg = await sendReply(englishReply);
            const sentEnglishMsgId = sentEnglishMsg?.id?._serialized || sentEnglishMsg?.id?.id || null;
            
            // Save English version in session so user can also download English Word document!
            saveAnswer({
                userKey: contact.key,
                question: targetSession.question,
                answer: englishVersion,
                messageId: sentEnglishMsgId,
                isEnglish: true
            });
            
            logger.info(`✅ Sent English version to ${contact.name} for question: "${questionSnippet}"`);
        } catch (err) {
            logger.error(`Failed to send English version: ${err.message}`);
            await sendReply(`⚠️ Maaf ${contact.name}, gagal meracik versi English-nya tadi. Coba ketik *!english* sekali lagi ya bro!`);
        }
        return;
    }
    
    // ========================================
    // ACADEMIC QUESTION HANDLING
    // ========================================
    
    // Check for media attachment (image / PDF document)
    let mediaContext = null;
    if (msg.hasMedia) {
        try {
            const media = await msg.downloadMedia();
            if (media && media.data) {
                mediaContext = {
                    data: media.data,
                    mimeType: media.mimetype
                };
            }
        } catch (err) {
            logger.warn(`Failed to download attached media: ${err.message}`);
        }
    }
    
    // If media is attached but text is brief or empty, set sensible default prompt
    if (mediaContext && (!command || command.length < 3)) {
        command = 'Tolong baca dan analisis seluruh isi lembar soal / dokumen terlampir ini. Berikan jawaban akademis yang lengkap, terstruktur, dan mendalam.';
    }
    
    // Validate question length
    if (!command || command.length < 5) {
        await sendReply(
            `Halo ${contact.name}! 👋\n\n` +
            'Mau tanya apa nih? Kasih pertanyaan atau kirim foto lembar soal ya biar jawaban gue mantep.\n\n' +
            `Ketik: *${PREFIX} [pertanyaan kamu]* atau kirim foto dengan caption *${PREFIX}*`
        );
        markMessageProcessed(messageId, { sender: senderDisplay, type: 'empty_prompt' });
        return;
    }
    
    // Mark as processed immediately so subsequent calls don't duplicate
    markMessageProcessed(messageId, { sender: senderDisplay, command: command.substring(0, 50) });
    
    // Try typing indicator (non-blocking)
    try {
        const chat = await msg.getChat();
        await chat.sendStateTyping();
    } catch (e) {
        // Ignore typing state errors
    }
    
    // Notice if this was an offline message (sent > 10 minutes ago)
    const msgAgeMinutes = Math.floor((Date.now() - (msg.timestamp * 1000)) / (60 * 1000));
    let prefixNotice = '';
    if (msgAgeMinutes > 10) {
        const ageText = msgAgeMinutes > 60 
            ? `${Math.floor(msgAgeMinutes / 60)} jam yang lalu` 
            : `${msgAgeMinutes} menit yang lalu`;
        prefixNotice = `*(Menjawab pertanyaan lo yang tertunda saat bot offline ${ageText})* ⚡\n\n`;
    }
    
    // Send "sedang riset" notification
    if (mediaContext) {
        await sendReply(`⏳ Bentar ya ${contact.name}, gue lagi baca lampiran foto/dokumen lo & riset jurnal serta putusan pengadilan biar jawaban gue daging semua... 📸📚⚖️`);
    } else {
        await sendReply(`⏳ Bentar ya ${contact.name}, gue lagi riset dulu di jurnal-jurnal & direktori putusan pengadilan (PN/MA) biar jawaban gue daging semua... 📚⚖️🔍`);
    }
    
    // Generate academic response
    const response = await generateResponse(command, contact.name, { media: mediaContext });
    
    // Increment question count using primary contact key
    incrementQuestionCount(contact.key);
    
    // Friendly follow-up offering Word Document and Natural Academic English version
    const followUpText = `\n\n━━━━━━━━━━━━━━━━━━━━━\n💬 *Gimana ${contact.name}, udah pas belum sama jawabannya?*\nKalo lo butuh:\n👉 *!word* ➔ Buat langsung download jawaban ini jadi **File Word (.docx)** rapi siap cetak (Times New Roman 12, Judul 14 Bold, Margin Skripsi 4-4-3-3)!\n👉 *!english* ➔ Buat versi **Natural Academic English** standar internasional PresUniv!\n\nOp65 siap bantu tugas lo tuntas sampai beres! 📄🇬🇧💪`;
    
    // Send the response + follow-up offer, and capture the sent message ID for accurate reply tracking
    const sentMsg = await sendReply(prefixNotice + response + followUpText);
    const sentMsgId = sentMsg?.id?._serialized || sentMsg?.id?.id || null;
    
    // Save this question, answer, and message ID in session isolated per user and per message
    saveAnswer({
        userKey: contact.key,
        question: command,
        answer: response,
        messageId: sentMsgId,
        isEnglish: false
    });
    
    logger.info(`✅ Answered question for ${contact.name} and offered Word & English versions (MsgID: ${sentMsgId || 'sent'})`);
}

/**
 * Handle user registration
 */
async function handleRegistration(msg, identifiers, command, sendReply, messageId) {
    const senderDisplay = identifiers[0] || msg.author || msg.from;
    markMessageProcessed(messageId, { sender: senderDisplay, type: 'registration' });
    
    // Check if already registered anywhere
    const existing = getContact(identifiers);
    if (existing) {
        // Link all current identifiers so the bot remembers everywhere
        for (const id of identifiers) {
            linkIdentifier(existing.key, id);
        }
        await sendReply(
            `Lo udah terdaftar, ${existing.name}! ✅ Gue udah kenal lo di grup mana pun.\n` +
            `🏫 ${existing.university || '-'}\n` +
            `📖 ${existing.faculty || '-'}\n\n` +
            'Langsung tanya atau kirim foto soal lo!'
        );
        return;
    }
    
    // Parse registration: kenalan Nama | Universitas | Jurusan
    const regText = command.replace(/^(kenalan|register|daftar)\s*/i, '').trim();
    const parts = regText.split('|').map(p => p.trim());
    
    if (!parts[0] || parts[0].length < 2) {
        await sendReply(
            '❌ Format kenalan-nya kurang tepat, bro.\n\n' +
            'Ketik gini:\n' +
            `*${PREFIX} kenalan [Nama] | [Universitas] | [Jurusan]*\n\n` +
            'Contoh:\n' +
            `*${PREFIX} kenalan Budi Santoso | President University | Hukum*`
        );
        return;
    }
    
    const name = parts[0];
    const university = parts[1] || '';
    const faculty = parts[2] || '';
    
    registerContact(identifiers, name, university, faculty);
    
    let reply = `✅ Salam kenal, ${name}! Gue Op65-Agent 🤖\n\n`;
    if (university) reply += `🏫 Universitas: ${university}\n`;
    if (faculty) reply += `📖 Jurusan: ${faculty}\n`;
    reply += '\nTenang bro, gue bakal selalu ingat lo di grup mana pun atau di DM pribadi! Gak perlu kenalan ulang.\n';
    reply += `Ketik: *${PREFIX} [pertanyaan]* atau kirim foto lembar soal.\n`;
    reply += `Nanti lo juga bisa download jawabannya jadi **File Word (.docx)** pake perintah *!word* atau versi Inggris pake *!english*!\n\n`;
    reply += '💪 Gas lah, gue siap bantu!';
    
    await sendReply(reply);
}

/**
 * Send help menu
 */
async function sendHelpMenu(sendReply) {
    const prefix = PREFIX;
    const help = `
🤖 *Op65-Agent - Menu Bantuan*
━━━━━━━━━━━━━━━━━━━━━
_AI Academic Assistant by Livelyhood Tonggo Tua Sinaga_

📋 *FITUR & COMMANDS:*

1️⃣ *${prefix} kenalan [Nama] | [Univ] | [Jurusan]*
   → Daftar sekali, bot bakal ingat lo di grup mana pun & di DM!

2️⃣ *${prefix} [pertanyaan]*
   → Tanya soal akademis, gue riset jurnal + putusan PN/MA dulu baru jawab

3️⃣ *!word (atau ${prefix} word)*
   → Download jawaban jadi **File Word (.docx)** rapi siap cetak (Times New Roman 12 & Judul 14 Bold, Margin 4-4-3-3)!

4️⃣ *!english (atau ${prefix} english)*
   → Bikin versi Natural Academic English standar internasional PresUniv!

5️⃣ *📸 Kirim Foto Soal / PDF + Caption: ${prefix}*
   → Bot langsung membaca foto kertas ujian & dokumen tugas lo

6️⃣ *${prefix} help*
   → Tampilkan menu ini

━━━━━━━━━━━━━━━━━━━━━
🌟 *KEUNGGULAN JAWABAN OP65:*
🎯 *Ringkasan Cepat 30 Detik* (Poin inti kilat)
⚖️ *Analisis Kasus IRAC & Putusan Pengadilan (PN/MA/MK)*
🏛️ *Hierarki Flow & Asas Preferensi Hukum* (Lex Superior, Lex Specialis, Lex Posterior)
📄 *File Word (.docx) Otomatis Siap Kumpul Dosen*
🇬🇧 *Versi Natural Academic English* (Standar internasional PresUniv)
📋 *Format Daftar Pustaka Siap Copas ke Word*

_"Jawaban Daging, Bukan Basa-Basi"_ 💪
`.trim();
    
    await sendReply(help);
}

/**
 * Handle list contacts command (owner only)
 */
async function handleListContacts(sendReply) {
    const contacts = getAllContacts();
    const keys = Object.keys(contacts);
    
    if (keys.length === 0) {
        await sendReply('📇 Belum ada contacts yang terdaftar.');
        return;
    }
    
    let reply = `📇 *Daftar Contacts Op65-Agent*\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    keys.forEach((key, i) => {
        const c = contacts[key];
        reply += `${i + 1}. *${c.name}*\n`;
        if (c.university) reply += `   🏫 ${c.university}\n`;
        if (c.faculty) reply += `   📖 ${c.faculty}\n`;
        if (c.phone) reply += `   📱 ${c.phone}\n`;
        reply += `   ❓ ${c.questionsAsked || 0} pertanyaan\n\n`;
    });
    
    await sendReply(reply);
}

/**
 * Check if sender is the owner
 */
function isOwner(identifiers) {
    if (!OWNER_PHONE) return false;
    const list = Array.isArray(identifiers) ? identifiers : [identifiers];
    return list.some(id => String(id).includes(OWNER_PHONE));
}

module.exports = { handleMessage };
