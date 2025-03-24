const { promisify } = require('util');
const cp = require('child_process');
const exec = promisify(cp.exec).bind(cp);
const logger = require('./logger');

/**
 * Execute shell commands via WhatsApp
 * @param {import('@whiskeysockets/baileys').WASocket} sock - The WhatsApp socket
 * @param {object} message - The message object
 * @param {string} command - The command to execute
 */
async function executeCommand(sock, message, command) {
    const sender = message.key.remoteJid;
    const ownerNumbers = process.env.OWNER_NUMBER?.split(',') || ['your-number@s.whatsapp.net']; // Configure your number
    
    // Security check - only allow owner to execute commands
    if (!ownerNumbers.includes(message.key.participant || sender)) {
        await sock.sendMessage(sender, { text: '⚠️ Only bot owner can use this command' }, { quoted: message });
        return;
    }
    
    await sock.sendMessage(sender, { text: '⏳ Executing command...' }, { quoted: message });
    
    try {
        logger.info(`Executing command: ${command}`);
        const { stdout, stderr } = await exec(command);
        
        if (stdout) {
            await sock.sendMessage(sender, { text: `📋 Result:\n\n${stdout}` }, { quoted: message });
        }
        
        if (stderr) {
            await sock.sendMessage(sender, { text: `⚠️ Error:\n\n${stderr}` }, { quoted: message });
        }
        
        if (!stdout && !stderr) {
            await sock.sendMessage(sender, { text: '✅ Command executed successfully (no output)' }, { quoted: message });
        }
    } catch (error) {
        logger.error({ error }, 'Error executing command');
        await sock.sendMessage(
            sender, 
            { text: `❌ Execution failed:\n\n${error.message}` }, 
            { quoted: message }
        );
    }
}

module.exports = { executeCommand };
