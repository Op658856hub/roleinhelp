// ===========================================
// Logger Utility
// ===========================================

const logger = {
    info: (message) => {
        const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        console.log(`[${timestamp}] ℹ️  ${message}`);
    },
    
    warn: (message) => {
        const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        console.warn(`[${timestamp}] ⚠️  ${message}`);
    },
    
    error: (message) => {
        const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        console.error(`[${timestamp}] ❌ ${message}`);
    },
    
    debug: (message) => {
        if (process.env.DEBUG === 'true') {
            const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
            console.log(`[${timestamp}] 🔧 ${message}`);
        }
    }
};

module.exports = { logger };
