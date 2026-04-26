const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { addExifToWebp } = require('./utils/exif');

const PACK_NAME = 'de • 909';
const AUTHOR = '';
const COMMAND = '.s';
const ERROR_MSG = 'Kirim/reply gambar atau video dengan caption .s';

// Max durasi video untuk stiker (detik)
const MAX_VIDEO_DURATION = 8;

/**
 * Buat path temp file yang unik
 */
function tempFile(ext) {
  return path.join(os.tmpdir(), `sticker_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
}

/**
 * Konversi video buffer ke animated WebP buffer menggunakan ffmpeg
 * @param {Buffer} videoBuffer
 * @returns {Promise<Buffer>}
 */
function convertVideoToWebp(videoBuffer) {
  return new Promise((resolve, reject) => {
    const inputPath = tempFile('mp4');
    const outputPath = tempFile('webp');

    fs.writeFileSync(inputPath, videoBuffer);

    ffmpeg(inputPath)
      .addOutputOptions([
        '-vcodec', 'libwebp',
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
        '-loop', '0',
        '-ss', '00:00:00',
        '-t', String(MAX_VIDEO_DURATION),
        '-preset', 'default',
        '-an',            // tanpa audio
        '-vsync', '0',
        '-quality', '50',
      ])
      .toFormat('webp')
      .on('end', () => {
        try {
          const webpBuffer = fs.readFileSync(outputPath);
          // Cleanup temp files
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
          resolve(webpBuffer);
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (err) => {
        // Cleanup temp files on error
        try { fs.unlinkSync(inputPath); } catch {}
        try { fs.unlinkSync(outputPath); } catch {}
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * Handle pesan masuk dan proses command stiker .s
 * @param {object} sock - Baileys socket instance
 * @param {object} msg - Pesan dari event messages.upsert
 */
async function handleStickerCommand(sock, msg) {
  const jid = msg.key.remoteJid;
  const message = msg.message;
  if (!message) return;

  // Deteksi teks pesan (bisa dari conversation, extendedText, image caption, atau video caption)
  const text =
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    '';

  const trimmedText = text.trim();
  if (trimmedText !== COMMAND) return;

  let imageMessage = null;
  let videoMessage = null;

  // Skenario 1: Media dikirim langsung dengan caption .s
  if (message.imageMessage) {
    imageMessage = message.imageMessage;
  } else if (message.videoMessage) {
    videoMessage = message.videoMessage;
  }

  // Skenario 2: Reply ke media dengan text .s
  if (!imageMessage && !videoMessage && message.extendedTextMessage?.contextInfo?.quotedMessage) {
    const quoted = message.extendedTextMessage.contextInfo.quotedMessage;
    if (quoted.imageMessage) {
      imageMessage = quoted.imageMessage;
    } else if (quoted.videoMessage) {
      videoMessage = quoted.videoMessage;
    }
  }

  // Tidak ada media → kirim pesan error
  if (!imageMessage && !videoMessage) {
    await sock.sendMessage(jid, { text: ERROR_MSG }, { quoted: msg });
    return;
  }

  try {
    let stickerBuffer;

    if (imageMessage) {
      // === PROSES GAMBAR → STIKER STATIS ===
      const mediaMsg = imageMessage === message.imageMessage
        ? msg
        : { key: msg.key, message: { imageMessage } };

      const buffer = await downloadMediaMessage(mediaMsg, 'buffer', {});

      const webpBuffer = await sharp(buffer)
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 80 })
        .toBuffer();

      stickerBuffer = await addExifToWebp(webpBuffer, PACK_NAME, AUTHOR);

    } else if (videoMessage) {
      // === PROSES VIDEO/GIF → STIKER ANIMASI ===
      const mediaMsg = videoMessage === message.videoMessage
        ? msg
        : { key: msg.key, message: { videoMessage } };

      const buffer = await downloadMediaMessage(mediaMsg, 'buffer', {});

      const webpBuffer = await convertVideoToWebp(buffer);
      stickerBuffer = await addExifToWebp(webpBuffer, PACK_NAME, AUTHOR);
    }

    // Kirim stiker
    await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });
  } catch (err) {
    console.error('Error creating sticker:', err);
  }
}

module.exports = { handleStickerCommand };
