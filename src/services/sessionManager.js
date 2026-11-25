// ===========================================
// Session Manager
// Keeps track of questions and answers:
// 1. Per-user personal history (so interruptions from other group members don't mess up context)
// 2. Per-message ID (so if a user quotes/replies to a specific previous answer, the bot knows exactly which one to translate)
// ===========================================

const { logger } = require('../utils/logger');

// Map<userKey, { question, answer, timestamp, messageId }>
const userSessions = new Map();

// Map<messageId, { userKey, question, answer, timestamp }>
const messageAnswers = new Map();

// Retention: keep last 100 message answers in memory
const MAX_SAVED_ANSWERS = 100;

/**
 * Save an answer record associated with both the user and the sent message ID
 * @param {object} param0 
 */
function saveAnswer({ userKey, question, answer, messageId }) {
    const record = {
        userKey,
        question,
        answer,
        messageId,
        timestamp: Date.now()
    };

    // 1. Save per-user (isolated from other group members)
    userSessions.set(userKey, record);

    // 2. Save by sent message ID (for quoted replies)
    if (messageId) {
        messageAnswers.set(messageId, record);
        
        // Prevent map from growing indefinitely
        if (messageAnswers.size > MAX_SAVED_ANSWERS) {
            const oldestKey = messageAnswers.keys().next().value;
            messageAnswers.delete(oldestKey);
        }
    }

    logger.debug(`Saved session for userKey: ${userKey}, messageId: ${messageId}`);
}

/**
 * Resolve target question & answer to translate into English:
 * Priority 1: If user quoted a specific bot answer message, match by quoted message ID
 * Priority 2: If user quoted message text matches an answer snippet
 * Priority 3: Fallback to the user's personal last asked question
 * 
 * @param {object} param0
 * @returns {object|null}
 */
function resolveTargetAnswer({ userKey, quotedMessageId, quotedBody }) {
    // 1. Match by quoted message ID
    if (quotedMessageId && messageAnswers.has(quotedMessageId)) {
        logger.info(`🎯 Matched target answer by quoted message ID: ${quotedMessageId}`);
        return messageAnswers.get(quotedMessageId);
    }

    // 2. Match by quoted message body content if available
    if (quotedBody) {
        for (const record of messageAnswers.values()) {
            if (record.answer && (record.answer.includes(quotedBody.substring(0, 50)) || quotedBody.includes(record.question.substring(0, 30)))) {
                logger.info(`🎯 Matched target answer by quoted message content match.`);
                return record;
            }
        }
    }

    // 3. Fallback to user's isolated personal last question
    if (userKey && userSessions.has(userKey)) {
        logger.info(`🎯 Matched target answer from user's personal last session: ${userKey}`);
        return userSessions.get(userKey);
    }

    return null;
}

module.exports = {
    saveAnswer,
    resolveTargetAnswer
};
