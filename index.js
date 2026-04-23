const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    Browsers,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { handleStickerCommand } = require('./stickerHandler');

const logger = pino({ level: 'silent' });

// Ganti dengan nomor WA kamu (dengan kode negara, tanpa + atau 0)
// Contoh: 6281234567890
const PHONE_NUMBER = '';

let isReconnecting = false;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        browser: Browsers.macOS('Chrome'),
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false,
    });

    // Pairing code (alternatif QR) — hanya jika belum terdaftar
    if (PHONE_NUMBER && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(PHONE_NUMBER);
                console.log(`\n🔑 Pairing Code: ${code}`);
                console.log('Buka WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number\n');
            } catch (err) {
                console.error('Gagal request pairing code:', err.message);
            }
        }, 3000);
    }

    // Simpan credentials saat update
    sock.ev.on('creds.update', saveCreds);

    // Handle koneksi
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Tampilkan QR code di terminal
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
