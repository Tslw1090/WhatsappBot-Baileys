const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const { messageHandler } = require('./messageHandler');
const logger = require('./logger');
const { suppressBaileysLogs, restoreConsole } = require('./suppressBaileys');
const config = require('./config');

// Create directories if they don't exist
if (!fs.existsSync(config.sessionsDir)) {
    fs.mkdirSync(config.sessionsDir, { recursive: true });
}

if (!fs.existsSync(config.logsDir)) {
    fs.mkdirSync(config.logsDir, { recursive: true });
}

if (!fs.existsSync(config.uploadsDir)) {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
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
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionsDir);
    
    // Create a silent logger for Baileys
    const baileysLogger = pino({ level: 'silent' });
    
    // Create WhatsApp socket connection with silent logging
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        logger: baileysLogger,
        browser: [config.botName, "Chrome", config.botVersion],
        // Additional options to reduce verbosity
        transactionOpts: { maxCommitRetries: 1, delayBetweenTriesMs: 10 },
        getMessage: async () => undefined
    });
    
    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (
                config.features.autoReconnect && 
                lastDisconnect.error instanceof Boom && 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
            );
            
            // Log error to file but simplified message to terminal
            logger.error({ error: lastDisconnect.error }, 'Connection closed');
            logger.terminal('⚠️ Connection closed. ' + (shouldReconnect ? 'Reconnecting...' : 'You are logged out.'));
            
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            logger.terminal(`✅ ${config.botName} is now connected and ready!`);
            logger.info(`${config.botName} is now connected!`);
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
    logger.terminal(`🚀 Starting ${config.botName}...`);
    logger.info(`${config.botName} is starting...`);
    await startBot();
})();
