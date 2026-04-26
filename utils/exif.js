/**
 * Inject Exif metadata (pack name & author) ke buffer WebP
 * agar WhatsApp mengenali sticker pack info.
 * @param {Buffer} webpBuffer - Buffer gambar WebP
 * @param {string} packName - Nama sticker pack
 * @param {string} author - Nama author
 * @returns {Promise<Buffer>} Buffer WebP dengan Exif metadata
 */
async function addExifToWebp(webpBuffer, packName, author) {
  const json = JSON.stringify({
    'sticker-pack-id': 'com.bot-wa.sticker',
    'sticker-pack-name': packName,
    'sticker-pack-publisher': author,
    emojis: ['✨'],
  });

  const jsonBuffer = Buffer.from(json, 'utf-8');
  const jsonLength = jsonBuffer.length;

  // Build Exif buffer sesuai TIFF/Exif spec
  const data = Buffer.alloc(22 + jsonLength);
  let offset = 0;

  // TIFF Header
  data.writeUInt16LE(0x4949, offset); offset += 2; // little-endian ("II")
  data.writeUInt16LE(0x002A, offset); offset += 2; // TIFF magic
  data.writeUInt32LE(0x00000008, offset); offset += 4; // offset to IFD0

  // IFD0
  data.writeUInt16LE(0x0001, offset); offset += 2; // 1 entry

  // IFD Entry: tag=0x5741 type=UNDEFINED(7) count=jsonLength offset=22
  data.writeUInt16LE(0x5741, offset); offset += 2; // tag
  data.writeUInt16LE(0x0007, offset); offset += 2; // type: undefined
  data.writeUInt32LE(jsonLength, offset); offset += 4; // count
  data.writeUInt32LE(22, offset); offset += 4; // value offset (data starts at byte 22)

  // Next IFD offset (0 = no more IFDs)
  data.writeUInt32LE(0x00000000, offset); offset += 4;

  // JSON data
  jsonBuffer.copy(data, offset);

  // Inject exif ke WebP menggunakan RIFF chunk manipulation
  return injectExifToWebp(webpBuffer, data);
}

/**
 * Inject Exif data ke WebP file secara manual via RIFF chunk
 * Lebih reliable daripada node-webpmux untuk animated WebP
 */
function injectExifToWebp(webpBuffer, exifData) {
  // WebP format: RIFF....WEBP[chunks...]
  // Kita perlu menambahkan EXIF chunk
  const EXIF_CHUNK_ID = Buffer.from('EXIF');

  // Buat EXIF chunk: "EXIF" + size(4 bytes LE) + data + padding
  const chunkSize = Buffer.alloc(4);
  chunkSize.writeUInt32LE(exifData.length);

  const exifChunk = Buffer.concat([
    EXIF_CHUNK_ID,
    chunkSize,
    exifData,
    // Padding byte jika ukuran ganjil
    ...(exifData.length % 2 !== 0 ? [Buffer.from([0x00])] : []),
  ]);

  // Gabungkan: WebP data asli + EXIF chunk baru
  const newWebp = Buffer.concat([webpBuffer, exifChunk]);

  // Update RIFF file size di header (byte 4-7)
  newWebp.writeUInt32LE(newWebp.length - 8, 4);

  return newWebp;
}

module.exports = { addExifToWebp };
