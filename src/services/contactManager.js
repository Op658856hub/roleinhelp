// ===========================================
// Contact Manager - Persistent Universal User Identity
// Remembers users across ALL WhatsApp groups and DMs,
// handling both Phone Numbers (@c.us) and Privacy LIDs (@lid).
// Strictly isolates individual users from group IDs (@g.us).
// ===========================================

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

const CONTACTS_FILE = path.join(__dirname, '..', '..', 'data', 'contacts.json');

// In-memory contact store
let contacts = {};

/**
 * Load contacts from file and migrate if necessary
 */
function loadContacts() {
    try {
        const dir = path.dirname(CONTACTS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (fs.existsSync(CONTACTS_FILE)) {
            const data = fs.readFileSync(CONTACTS_FILE, 'utf-8');
            contacts = JSON.parse(data);
            
            // Normalize existing records and purge any accidental group IDs (@g.us)
            let modified = false;
            for (const [key, user] of Object.entries(contacts)) {
                if (!user.identifiers) {
                    user.identifiers = [key];
                    modified = true;
                }
                // Purge any group IDs from user identifiers
                const filtered = user.identifiers.filter(id => !String(id).includes('@g.us'));
                if (filtered.length !== user.identifiers.length) {
                    user.identifiers = filtered;
                    modified = true;
                }
                if (user.phone && user.phone.includes('@g.us')) {
                    user.phone = '';
                    modified = true;
                }
            }
            if (modified) {
                saveContacts();
            }
            logger.info(`📇 Loaded ${Object.keys(contacts).length} contacts with universal tracking.`);
        } else {
            contacts = {};
            saveContacts();
            logger.info('📇 Created new contacts file.');
        }
    } catch (error) {
        logger.error(`Failed to load contacts: ${error.message}`);
        contacts = {};
    }
}

/**
 * Save contacts to file
 */
function saveContacts() {
    try {
        const dir = path.dirname(CONTACTS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
    } catch (error) {
        logger.error(`Failed to save contacts: ${error.message}`);
    }
}

/**
 * Check if a user is registered/known by checking ANY of their possible individual identifiers
 * (Phone Number, LID, Serialized ID, digits)
 * @param {string|string[]} identifiers - Single ID or Array of candidate IDs
 * @returns {object|null} - Contact info with primary key, or null
 */
function getContact(identifiers) {
    const list = Array.isArray(identifiers) ? identifiers : [identifiers];
    const cleanedList = list
        .filter(Boolean)
        .map(id => String(id).trim().toLowerCase())
        // NEVER match on group IDs or broadcasts
        .filter(id => !id.includes('@g.us') && !id.includes('@broadcast'));

    if (cleanedList.length === 0) return null;

    for (const [key, user] of Object.entries(contacts)) {
        const userKey = key.toLowerCase();
        const userIdentifiers = (user.identifiers || [key]).map(id => String(id).toLowerCase());
        const userPhone = (user.phone || '').replace(/[^0-9]/g, '');

        for (const candidate of cleanedList) {
            const candidateDigits = candidate.replace(/[^0-9]/g, '');

            // 1. Direct match on key
            if (candidate === userKey) {
                return { key, ...user };
            }

            // 2. Match in individual identifiers array
            if (userIdentifiers.includes(candidate)) {
                return { key, ...user };
            }

            // 3. Match on phone digits (if valid phone length between 9 and 15 digits)
            if (userPhone && candidateDigits && userPhone.length >= 9 && userPhone === candidateDigits) {
                linkIdentifier(key, candidate);
                return { key, ...user };
            }
        }
    }

    return null;
}

/**
 * Link an alternate identifier (e.g. LID to Phone) to an existing user
 * Strictly blocks group IDs from ever being linked.
 * @param {string} primaryKey 
 * @param {string} newIdentifier 
 */
function linkIdentifier(primaryKey, newIdentifier) {
    if (!newIdentifier) return;
    const str = String(newIdentifier).toLowerCase();
    
    // STRICT GUARD: Never link a group ID (@g.us) to an individual!
    if (str.includes('@g.us') || str.includes('@broadcast') || str.includes('status')) {
        return;
    }

    if (contacts[primaryKey]) {
        if (!contacts[primaryKey].identifiers) {
            contacts[primaryKey].identifiers = [primaryKey];
        }
        if (!contacts[primaryKey].identifiers.includes(newIdentifier)) {
            contacts[primaryKey].identifiers.push(newIdentifier);
            const digits = newIdentifier.replace(/[^0-9]/g, '');
            if (digits && digits.length >= 9 && digits.length <= 15 && !contacts[primaryKey].identifiers.includes(digits)) {
                contacts[primaryKey].identifiers.push(digits);
            }
            saveContacts();
            logger.info(`🔗 Linked alternate identifier "${newIdentifier}" to user "${contacts[primaryKey].name}"`);
        }
    }
}

/**
 * Register a new contact with all individual candidate identifiers
 * @param {string|string[]} identifiers - Main ID or list of IDs
 * @param {string} name - User's name
 * @param {string} university - University name
 * @param {string} faculty - Faculty/major
 */
function registerContact(identifiers, name, university = '', faculty = '') {
    const list = (Array.isArray(identifiers) ? identifiers : [identifiers])
        .filter(id => !String(id).includes('@g.us') && !String(id).includes('@broadcast'));
        
    const primaryKey = list[0] || `${Date.now()}@user`;
    
    // Extract phone number if available (valid international length)
    let phone = '';
    for (const id of list) {
        if (id.includes('@c.us') || (!id.includes('@lid') && id.replace(/[^0-9]/g, '').length >= 9 && id.replace(/[^0-9]/g, '').length <= 15)) {
            phone = id.replace(/[^0-9]/g, '');
            break;
        }
    }

    const uniqueIdentifiers = [...new Set(list)];
    for (const id of list) {
        const digits = id.replace(/[^0-9]/g, '');
        if (digits && digits.length >= 9 && digits.length <= 15) {
            uniqueIdentifiers.push(digits);
        }
    }

    contacts[primaryKey] = {
        name: name,
        university: university,
        faculty: faculty,
        phone: phone,
        identifiers: [...new Set(uniqueIdentifiers)],
        registeredAt: new Date().toISOString(),
        questionsAsked: 0
    };

    saveContacts();
    logger.info(`📇 New contact registered: ${name} (Key: ${primaryKey})`);
    return contacts[primaryKey];
}

/**
 * Increment question count for a contact
 * @param {string} primaryKey 
 */
function incrementQuestionCount(primaryKey) {
    if (contacts[primaryKey]) {
        contacts[primaryKey].questionsAsked = (contacts[primaryKey].questionsAsked || 0) + 1;
        saveContacts();
    }
}

/**
 * Remove a contact
 * @param {string} primaryKey 
 */
function removeContact(primaryKey) {
    if (contacts[primaryKey]) {
        delete contacts[primaryKey];
        saveContacts();
        return true;
    }
    return false;
}

/**
 * List all contacts
 * @returns {object}
 */
function getAllContacts() {
    return contacts;
}

module.exports = {
    loadContacts,
    getContact,
    registerContact,
    linkIdentifier,
    incrementQuestionCount,
    removeContact,
    getAllContacts
};
