const { GoogleGenAI } = require('@google/genai');

// API Key dari environment variable
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

if (!GEMINI_API_KEY) {
  console.warn('⚠️  GEMINI_API_KEY belum di-set! Fitur .ai tidak akan berfungsi.');
}

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const COMMAND = '.ai';
const MODEL = 'gemini-3-flash';

/**
 * Handle command .ai — kirim prompt ke Gemini dan reply hasilnya
 * @param {object} sock - Baileys socket instance
 * @param {object} msg - Pesan dari event messages.upsert
 */
async function handleAiCommand(sock, msg) {
  const jid = msg.key.remoteJid;
  const message = msg.message;
  if (!message) return;

  // Deteksi teks pesan
  const text =
    message.conversation ||
    message.extendedTextMessage?.text ||
    '';

  const trimmedText = text.trim();
  if (!trimmedText.startsWith(COMMAND)) return;

  // Ambil prompt setelah .ai
  const prompt = trimmedText.slice(COMMAND.length).trim();

  if (!prompt) {
    await sock.sendMessage(jid, { text: 'Gunakan: .ai [pertanyaan]\nContoh: .ai Apa itu machine learning?' }, { quoted: msg });
    return;
  }

  if (!ai) {
    await sock.sendMessage(jid, { text: '⚠️ AI belum dikonfigurasi.' }, { quoted: msg });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        systemInstruction: 'Kamu adalah asisten AI yang helpful di WhatsApp. Jawab dengan singkat, jelas, dan informatif. Gunakan bahasa yang sama dengan pertanyaan user. Jangan gunakan format markdown yang kompleks karena ini di WhatsApp — gunakan teks biasa atau emoji saja.',
        maxOutputTokens: 1024,
        temperature: 0.7,
      },
    });

    const reply = response.text || 'Maaf, tidak bisa menghasilkan jawaban.';
    await sock.sendMessage(jid, { text: reply }, { quoted: msg });
  } catch (err) {
    console.error('Error AI:', err);
    await sock.sendMessage(jid, { text: '⚠️ Gagal memproses permintaan AI. Coba lagi nanti.' }, { quoted: msg });
  }
}

module.exports = { handleAiCommand };
