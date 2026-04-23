const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { handleStickerCommand } = require('./stickerHandler');

const logger = pino({ level: 'silent' });

let isReconnecting = false;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger,
        browser: ['Bot-WA', 'Chrome', '4.0.0'],
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false,
    });

    // Simpan credentials saat update
    sock.ev.on('creds.update', saveCreds);

    // Handle koneksi
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n📱 Scan QR Code di atas dengan WhatsApp!\n');
        }

        if (connection === 'close') {
            const statusCode =
                lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(
                `⚠️  Koneksi terputus (code: ${statusCode}).`,
                shouldReconnect ? 'Reconnecting...' : 'Logged out, silakan hapus folder auth_info dan scan ulang.'
            );

            if (shouldReconnect && !isReconnecting) {
                isReconnecting = true;
                setTimeout(() => {
                    isReconnecting = false;
                    startBot();
                }, 5000);
            }
        }

        if (connection === 'open') {
            isReconnecting = false;
            console.log('✅ Bot berhasil terhubung ke WhatsApp!');
        }
    });

    // Handle pesan masuk
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (msg.key.fromMe) continue;

            try {
                await handleStickerCommand(sock, msg);
            } catch (err) {
                console.error('Error handling message:', err);
            }
        }
    });
}

// Start bot
startBot().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Bot dihentikan.');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Bot dihentikan.');
    process.exit(0);
});
