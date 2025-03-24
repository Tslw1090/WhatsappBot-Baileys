const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Load commands from commands folder
const commands = new Map();
const commandsDir = path.join(__dirname, 'commands');

// Create commands directory if it doesn't exist
if (!fs.existsSync(commandsDir)) {
    fs.mkdirSync(commandsDir, { recursive: true });
}

// Load all command modules
const loadCommands = () => {
    commands.clear();
    const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        try {
            const command = require(path.join(commandsDir, file));
            if (command.name && command.execute) {
                commands.set(command.name.toLowerCase(), command);
                // Don't show this in terminal, only in log file
                logger.info(`Loaded command: ${command.name}`);
            } else {
                logger.warn(`Command file ${file} is missing required properties`);
            }
        } catch (error) {
            logger.error({ error }, `Error loading command file ${file}`);
        }
    }
    
    logger.terminal(`📚 Loaded ${commands.size} commands`);
};

// Initial command loading
loadCommands();

// Watch for changes in the commands directory
fs.watch(commandsDir, (eventType, filename) => {
    if (filename && filename.endsWith('.js')) {
        // Clear require cache for this file
        const filePath = path.join(commandsDir, filename);
        if (require.cache[require.resolve(filePath)]) {
            delete require.cache[require.resolve(filePath)];
        }
        
        // Reload all commands
        logger.terminal(`🔄 Command file changed, reloading commands...`);
        loadCommands();
    }
});

const messageHandler = async (sock, message) => {
    try {
        if (!message.message) return;
        
        const messageType = Object.keys(message.message)[0];
        let messageContent;
        
        if (messageType === 'conversation') {
            messageContent = message.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
            messageContent = message.message.extendedTextMessage.text;
        } else {
            messageContent = 'Non-text message received';
        }
        
        const senderNumber = message.key.remoteJid;
        
        // Log full message details to file, but nothing to terminal
        logger.info({
            sender: senderNumber,
            type: messageType,
            content: messageContent
        }, 'Message received');
        
        // Process commands
        if (messageContent.startsWith('!')) {
            const [commandName, ...args] = messageContent.slice(1).split(' ');
            const command = commands.get(commandName.toLowerCase());
            
            // Only show executed commands in terminal
            if (command) {
                logger.terminal(`🔹 ${senderNumber}: !${commandName}`);
                await command.execute(sock, message, args.join(' '), {
                    senderNumber,
                    messageContent,
                    messageType
                });
                logger.info(`Command ${commandName} executed by ${senderNumber}`);
            } else {
                logger.terminal(`❓ ${senderNumber}: Unknown command !${commandName}`);
                await sock.sendMessage(senderNumber, { 
                    text: `Unknown command: ${commandName}. Type !help to see available commands.` 
                });
                logger.info(`Unknown command ${commandName} requested by ${senderNumber}`);
            }
        }
        
    } catch (error) {
        logger.error({ error }, 'Error handling message');
        logger.terminal('❌ Error handling message: ' + error.message);
    }
};

module.exports = { messageHandler };
