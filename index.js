const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const { messageHandler } = require('./messageHandler');
const logger = require('./logger');
const { suppressBaileysLogs, restoreConsole } = require('./suppressBaileys');

// Path for storing session data
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

// Suppress Baileys console outputs
suppressBaileysLogs();

// Handle process exit to restore console
process.on('exit', restoreConsole);
process.on('SIGINT', () => {
    restoreConsole();
    process.exit(0);
});

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sessions');
    
    // Create a silent logger for Baileys
    const baileysLogger = pino({ level: 'silent' });
    
    // Create WhatsApp socket connection with silent logging
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        logger: baileysLogger,
        browser: ["WhatsApp Bot", "Chrome", "1.0.0"],
        // Additional options to reduce verbosity
        transactionOpts: { maxCommitRetries: 1, delayBetweenTriesMs: 10 },
        getMessage: async () => undefined
    });
    
    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom && 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut);
            
            // Log error to file but simplified message to terminal
            logger.error({ error: lastDisconnect.error }, 'Connection closed');
            logger.terminal('⚠️ Connection closed. ' + (shouldReconnect ? 'Reconnecting...' : 'You are logged out.'));
            
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            logger.terminal('✅ Bot is now connected and ready!');
            logger.info('Bot is now connected!');
        }
    });
    
    // Save session credentials whenever they are updated
    sock.ev.on('creds.update', saveCreds);
    
    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const message of messages) {
            if (!message.key.fromMe) {
                await messageHandler(sock, message);
            }
        }
    });
}

// Start the bot
(async () => {
    logger.terminal('🚀 Starting WhatsApp Bot...');
    logger.info('Bot is starting...');
    await startBot();
})();
