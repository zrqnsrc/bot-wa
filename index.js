const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { handleStickerCommand } = require('./stickerHandler');
const { handleAiCommand } = require('./aiHandler');

const logger = pino({ level: 'silent' });

let isReconnecting = false;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    // Fetch versi WhatsApp Web terbaru agar tidak ditolak server
    let version;
    try {
        const { version: fetchedVersion } = await fetchLatestBaileysVersion();
        version = fetchedVersion;
        console.log(`📌 Menggunakan WA Web versi: ${version.join('.')}`);
    } catch (err) {
        version = [2, 3000, 1037641644];
        console.log(`📌 Gagal fetch versi, menggunakan fallback: ${version.join('.')}`);
    }

    const sock = makeWASocket({
        auth: state,
        version,
        logger,
        browser: ['Chrome', 'Windows', '110.0.5481.177'],
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false,
    });

    // Simpan credentials saat update
    sock.ev.on('creds.update', saveCreds);

    // Handle koneksi
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Render QR code secara manual
        if (qr) {
            console.log('\n📱 Scan QR Code berikut dengan WhatsApp:\n');
            qrcode.generate(qr, { small: true });
            console.log('\nBuka WhatsApp → Settings → Linked Devices → Link a Device\n');
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
                await handleAiCommand(sock, msg);
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
