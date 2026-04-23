const webpmux = require('node-webpmux');

/**
 * Inject Exif metadata (pack name & author) ke buffer WebP
 * agar WhatsApp mengenali sticker pack info.
 * @param {Buffer} webpBuffer - Buffer gambar WebP
 * @param {string} packName - Nama sticker pack
 * @param {string} author - Nama author
 * @returns {Promise<Buffer>} Buffer WebP dengan Exif metadata
 */
async function addExifToWebp(webpBuffer, packName, author) {
    const img = new webpmux.Image();
    await img.load(webpBuffer);

    const json = JSON.stringify({
        'sticker-pack-id': 'bot-wa-sticker',
        'sticker-pack-name': packName,
        'sticker-pack-publisher': author,
        emojis: ['✨'],
    });

    // Build Exif buffer sesuai spesifikasi WebP
    const exifHeader = Buffer.from([
        0x49, 0x49, // little-endian
        0x2a, 0x00, // TIFF magic
        0x08, 0x00, 0x00, 0x00, // offset to IFD
        0x01, 0x00, // 1 entry
        0x41, 0x57, // tag 0x5741
        0x07, 0x00, // type: undefined
    ]);

    const jsonBuffer = Buffer.from(json, 'utf-8');
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(jsonBuffer.length);

    const offsetBuffer = Buffer.from([0x16, 0x00, 0x00, 0x00]);
    const endBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);

    const exifBuffer = Buffer.concat([
        exifHeader,
        lengthBuffer,
        offsetBuffer,
        endBuffer,
        jsonBuffer,
    ]);

    img.exif = exifBuffer;
    return await img.save(null);
}

module.exports = { addExifToWebp };
