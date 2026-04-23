const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const { addExifToWebp } = require('./utils/exif');

const PACK_NAME = 'de • 909';
const AUTHOR = 'de • 909';
const COMMAND = '.s';
const ERROR_MSG = 'Kirim/reply gambar dengan caption .s';

/**
 * Handle pesan masuk dan proses command stiker .s
 * @param {object} sock - Baileys socket instance
 * @param {object} msg - Pesan dari event messages.upsert
 */
async function handleStickerCommand(sock, msg) {
    const jid = msg.key.remoteJid;
    const message = msg.message;
    if (!message) return;

    // Deteksi teks pesan (bisa dari conversation, extendedText, atau imageMessage caption)
    const text =
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        '';

    const trimmedText = text.trim();
    if (trimmedText !== COMMAND) return;

    let imageMessage = null;

    // Skenario 1: Gambar dikirim dengan caption .s
    if (message.imageMessage) {
        imageMessage = message.imageMessage;
    }

    // Skenario 2: Reply ke gambar dengan text .s
    if (!imageMessage && message.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quoted = message.extendedTextMessage.contextInfo.quotedMessage;
        if (quoted.imageMessage) {
            imageMessage = quoted.imageMessage;
        }
    }

    // Tidak ada gambar → kirim pesan error
    if (!imageMessage) {
        await sock.sendMessage(jid, { text: ERROR_MSG }, { quoted: msg });
        return;
    }

    try {
        // Download media dari pesan
        const mediaMsg = imageMessage === message.imageMessage
            ? msg
            : {
                key: msg.key,
                message: { imageMessage },
            };

        const buffer = await downloadMediaMessage(
            mediaMsg,
            'buffer',
            {}
        );

        // Konversi ke WebP 512x512 dengan sharp
        const webpBuffer = await sharp(buffer)
            .resize(512, 512, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .webp({ quality: 80 })
            .toBuffer();

        // Inject Exif metadata
        const stickerBuffer = await addExifToWebp(webpBuffer, PACK_NAME, AUTHOR);

        // Kirim stiker
        await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });
    } catch (err) {
        console.error('Error creating sticker:', err);
    }
}

module.exports = { handleStickerCommand };
