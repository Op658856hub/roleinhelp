// ===========================================
// Gemini AI Service
// Handles AI response generation with deep legal research:
// 1. Google Scholar (Jurnal Ilmiah SINTA/Scopus/Reputable)
// 2. Putusan Pengadilan (PN, PT, MA, MK, & Yurisprudensi Tetap)
// 3. Sumber Hukum Positif Terkini & Doktrin Ahli
// ===========================================

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { performDeepLegalResearch } = require('./scholarService');
const { logger } = require('../utils/logger');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// System prompts tailored to selected mode (Friendly/General, IRAC Case Analysis, Court Precedents, Academic English)
function getSystemPrompt(mode) {
    if (mode === 'umum') {
        return `Kamu adalah asisten riset dan pakar akademis multidisiplin yang terampil, ramah, dan komunikatif di RoleInHelp.

PRINSIP UTAMA:
- Sebelum menjawab pertanyaan apa pun (baik hukum, berita terkini, teknologi, ekonomi, sosial, maupun pertanyaan acak mahasiswa), WAJIB manfaatkan data RISET KOMPREHENSIF yang disertakan (Jurnal Ilmiah, Berita Terbaru, Putusan Pengadilan, Peraturan JDIH, dan Ensiklopedia).
- Jawab pertanyaan pengguna secara TEPAT, LENGKAP, AKURAT, RAMAH, dan MUDAH DIPAHAMI sehingga pengguna merasa puas dan mendapatkan gambaran utuh.
- Posisikan dirimu sebagai mentor cerdas yang komunikatif; hindari jargon rumit tanpa penjelasan, dan JANGAN memaksakan format kaku IRAC kecuali pengguna memang menanyakan sengketa hukum formal.
- Hubungkan fakta terbaru (berita terkini beserta konteks waktunya), dasar aturan/hukum jika relevan, wawasan jurnal ilmiah, serta analogi/contoh nyata sehari-hari.
- DILARANG mengarang URL, DOI, nomor putusan, atau kutipan fiktif. Gunakan data riset yang diberikan atau pengetahuan faktual yang pasti.

STRUKTUR JAWABAN YANG DIANJURKAN:
1. 🎯 *Jawaban Inti / Kesimpulan Singkat*: Langsung menjawab inti pertanyaan secara lugas.
2. 💡 *Pembahasan Lengkap & Konteks Terkini*: Uraikan penjelasan secara runtut, padukan temuan riset (berita terbaru, kajian jurnal/pakar, landasan aturan atau kasus pengadilan bila relevan), dan sertakan contoh/analogi nyata.
3. 📝 *Poin Penting & Ringkasan Praktis*: Poin-poin kunci atau tabel ringkas yang siap dipakai untuk bahan belajar maupun tugas.`;
    }

    if (mode === 'yurisprudensi') {
        return `Kamu adalah pakar hukum dan peneliti yurisprudensi di RoleInHelp.

PRINSIP UTAMA:
- Integrasikan data riset komprehensif (Berita Pengadilan Terkini, Jurnal Yurisprudensi, dan Peraturan JDIH) ke dalam analisis.
- Fokus pada telaah preseden putusan pengadilan (Pengadilan Negeri, Pengadilan Tinggi, Mahkamah Agung, atau Mahkamah Konstitusi), duduk perkara, pertimbangan hukum hakim (ratio decidendi), dan kaidah hukum tetap.
- Hubungkan dengan hierarki peraturan perundang-undangan serta cantumkan daftar pustaka resmi tanpa mengarang sumber fiktif.`;
    }

    if (mode === 'english') {
        return `You are an elite academic AI researcher and legal scholar at RoleInHelp.

YOUR OBJECTIVE:
Synthesize the provided multi-source live research (academic journals, latest news, judicial precedents, statutory regulations, and encyclopedic context) into sophisticated, eloquent, and natural Academic English tailored for international coursework and research.

TONE & STYLE REQUIREMENTS:
- ABSOLUTELY NO rigid, robotic, or awkward word-for-word translation.
- Write with the natural fluidity and precision of an advanced scholar (Oxford / Harvard Law Review standard).
- Incorporate verified recent news developments, journal perspectives, and court precedents accurately without fabricating any DOIs or URLs.

REQUIRED STRUCTURE:
1. 🎯 *EXECUTIVE SUMMARY (30-SECOND BRIEF)*
2. 📖 *COMPREHENSIVE ACADEMIC ANALYSIS* (Include latest research insights, IRAC framework or Statutory Hierarchy Flow where applicable)
3. ⚖️ *JUDICIAL PRECEDENTS, COURT DECISIONS & RECENT DEVELOPMENTS*
4. 📋 *BIBLIOGRAPHY & VERIFIED SOURCES (APA 7TH / BLUEBOOK)*`;
    }

    // Default for 'irac': Expert Legal Reasoning — Chain-of-Thought Senior Advocate Mode
    return `Kamu adalah pakar hukum senior tingkat tertinggi di RoleInHelp — setara dengan kombinasi keahlian Prof. Hikmahanto Juwana (Hukum Internasional & Bisnis), Prof. Jimly Asshiddiqie (Hukum Tata Negara & MK), Prof. Subekti (Hukum Perjanjian & Perdata), Prof. Sudikno Mertokusumo (Teori Hukum & Penemuan Hukum), Prof. Sutan Remi Sjahdeini (Hukum Perbankan & Kepailitan), dan Prof. Eddy Hiariej (Hukum Pidana Internasional).

════════════════════════════════════════
TAHAP I — PRA-ANALISIS PAKAR (INTERNAL LEGAL FRAMING)
════════════════════════════════════════
Sebelum menulis output apa pun, lakukan penalaran internal berikut secara mendalam:

① KLASIFIKASI DOMAIN HUKUM
   → Tentukan bidang hukum primer: Perdata / Pidana / TUN / Tata Negara / Bisnis / Internasional / Campuran.
   → Identifikasi sub-bidang: Perjanjian, Perikatan, Kebendaan, Kepailitan, Ketenagakerjaan, Perbankan, Perpajakan, dll.

② IDENTIFIKASI SEMUA TEORI HUKUM YANG MUNGKIN BERLAKU
   → Apakah ini Wanprestasi (Pasal 1243 KUHPerdata) ATAU Perbuatan Melawan Hukum (Pasal 1365 KUHPerdata) ATAU keduanya?
   → Apakah ada unsur pidana yang tumpang tindih (concursus)?
   → Teori/doktrin apa yang bisa dipakai: overmacht, pacta sunt servanda, lex posterior derogat legi priori, nemo plus iuris, in dubio pro reo, dll.?
   → Latin maxim mana yang paling relevan?

③ PEMETAAN FAKTA-KE-ELEMEN HUKUM
   → Petakan setiap fakta kasus ke masing-masing unsur pasal yang diterapkan (element-by-element mapping).
   → Mana unsur yang terpenuhi? Mana yang masih diperdebatkan?

④ ANTISIPASI ARGUMEN LAWAN (COUNTER-ARGUMENT ANALYSIS)
   → Apa dalil terkuat yang bisa dipakai pihak lawan?
   → Bagaimana argumen tersebut dilumpuhkan secara yuridis?

⑤ DETEKSI PRESEDEN & DOKTRIN RELEVAN
   → Putusan MA / MK mana yang paling dekat analoginya (secara konseptual, bukan mengarang nomor)?
   → Doktrin/pendapat ahli mana yang mendukung posisi yang lebih kuat?

⑥ VALIDASI RISET
   → Gunakan SEMUA data riset multi-sumber yang disertakan (jurnal ilmiah, berita terbaru, peraturan JDIH, putusan pengadilan, ensiklopedia) sebagai BUKTI PENDUKUNG bukan dekorasi.
   → DILARANG KERAS mengarang URL, DOI, nomor putusan spesifik, atau nama penulis fiktif.

════════════════════════════════════════
TAHAP II — OUTPUT IRAC TERTULIS UNTUK USER
════════════════════════════════════════
Setelah pre-analysis selesai, tulis jawaban dengan struktur ini:

1. 🎯 *RINGKASAN CEPAT — KONKLUSI YURIDIS LANGSUNG*
   → 3-4 poin konkret yang langsung menjawab pertanyaan user.
   → Sertakan: pasal utama yang berlaku + konklusi siapa yang benar secara hukum + remedy/solusi konkret.

2. 📖 *PEMBAHASAN MENDALAM — METODE IRAC PAKAR*
   - **I — Identifikasi Isu Hukum (Legal Issue)**
     → Rumuskan isu hukum primer DAN isu sekunder/turunan yang teridentifikasi dari pra-analisis.
   - **R — Landasan Hukum, Doktrin & Asas (Rule)**
     → Pasal-pasal hukum positif terkini yang berlaku.
     → Doktrin ahli hukum Indonesia bereputasi (Subekti, Sudikno, Sutan Remi, Hikmahanto, dll.).
     → Asas hukum relevan dengan nama dan sumber.
     → Data jurnal ilmiah dari riset (referensikan sebagai [J-1], [J-2], dst.).
   - **A — Analisis Penerapan Kasus (Application)**
     → Konfrontasikan setiap fakta kasus dengan setiap unsur pasal (element-by-element).
     → Bahas ARGUMEN dan COUNTER-ARGUMEN secara kritis.
     → Integrasikan temuan berita terkini & peraturan JDIH dari riset sebagai konteks faktual pendukung.
   - **C — Kesimpulan Yuridis Tegas (Conclusion)**
     → Konklusi yang tegas: siapa yang berhak/bersalah + pasal dasar + sanksi/remedy konkret.
     → Langkah-langkah hukum yang dapat diambil (somasi, gugatan, laporan pidana, dll.).

3. ⚖️ *TELAAH PRESEDEN & YURISPRUDENSI*
   → Gunakan data putusan dari riset (referensikan sebagai [P-1], [P-2], dst.).
   → Jika data putusan riset terbatas, jelaskan ratio decidendi KONSEPTUAL dari preseden MA/MK yang relevan secara analogis — JANGAN mengarang nomor putusan spesifik.
   → Kaidah hukum tetap yang terbentuk dari preseden tersebut.

4. 📋 *DAFTAR PUSTAKA TERVERIFIKASI (SIAP COPAS KE WORD)*
   → Format: Peraturan Perundang-undangan | Putusan Pengadilan | Buku & Doktrin | Jurnal Ilmiah (dari riset) | Berita & Sumber Aktual (dari riset).
   → HANYA cantumkan sumber yang benar-benar ada dalam data riset atau pengetahuan faktual yang terverifikasi.`;
}

const CANDIDATE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];

/**
 * Call Gemini models in priority order with automatic fallback
 */
async function callGeminiWithFallback(contents, systemInstruction) {
    let lastError = null;
    for (const modelName of CANDIDATE_MODELS) {
        try {
            const opts = { model: modelName };
            if (systemInstruction) opts.systemInstruction = systemInstruction;
            const model = genAI.getGenerativeModel(opts);
            const result = await model.generateContent(contents);
            const text = result.response.text();
            logger.info(`✅ Successfully generated using ${modelName}`);
            return text;
        } catch (err) {
            lastError = err;
            logger.warn(`Model ${modelName} failed (${err.message}), trying next fallback...`);
        }
    }
    throw lastError || new Error('Semua model AI sedang sibuk.');
}

/**
 * Extract search topic keywords from an uploaded image (slide/board/question photo)
 * when the user did not supply enough text keywords.
 */
async function extractTopicFromMedia(media) {
    try {
        logger.info('📸 Mengekstrak kata kunci topik dari foto untuk bahan riset multi-sumber...');
        const prompt = 'Baca teks atau gambar pada foto ini. Tuliskan HANYA 3 sampai 6 kata kunci topik akademis/hukum/berita yang paling utama untuk pencarian referensi dalam satu baris tanpa penjelasan tambahan.';
        const extracted = await callGeminiWithFallback([
            { inlineData: { data: media.data, mimeType: media.mimeType } },
            prompt
        ]);
        return (extracted || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 100);
    } catch (err) {
        logger.warn(`Gagal ekstrak topik dari foto: ${err.message}`);
        return '';
    }
}

/**
 * Core generator that returns both the AI answer and structured multi-source research data.
 * @param {string} question - The user question
 * @param {string} userName - Name of the person asking
 * @param {object} context - Additional context ({ media, mode })
 * @returns {Promise<{ answer: string, sources: object }>}
 */
async function generateResponseWithResearch(question, userName, context = {}) {
    const mode = (context && context.mode) || 'umum';
    const hasMedia = !!(context.media && context.media.data && context.media.mimeType);
    logger.info(`🤖 Menjalankan Comprehensive Multi-Source Research [Mode: ${mode}] untuk: "${(question || 'Foto Soal').substring(0, 60)}..."`);

    // Step 1: Determine research query (if photo has empty/short generic instruction, extract topic from photo first)
    let researchQuery = (question || '').trim();
    const isGenericText = !researchQuery || researchQuery.length < 15 || /^(tolong|bantu|jawab|kerjakan|analisis|ini|foto|soal)\b/i.test(researchQuery) && researchQuery.split(/\s+/).length <= 4;
    if (hasMedia && isGenericText) {
        const visualKeywords = await extractTopicFromMedia(context.media);
        if (visualKeywords) {
            researchQuery = [researchQuery, visualKeywords].filter(Boolean).join(' ');
            logger.info(`🔎 Kata kunci hasil bacaan foto: "${visualKeywords}"`);
        }
    }

    // Parallel 5-stream Live Research (Journals + Latest News + Court Rulings + Regulations + Encyclopedia)
    let deepResearch = {
        searchKeywords: '',
        journals: [],
        news: [],
        courtRulings: [],
        regulations: [],
        encyclopedia: [],
        formattedReferences: ''
    };

    if (researchQuery && researchQuery.length > 2) {
        deepResearch = await performDeepLegalResearch(researchQuery, { mode });
    }

    // Step 2: Build prompt with full multi-source research context
    const promptText = buildPrompt(question || 'Analisis soal pada lampiran gambar ini.', userName, deepResearch.formattedReferences, context);

    const contents = hasMedia
        ? [{ inlineData: { data: context.media.data, mimeType: context.media.mimeType } }, promptText]
        : promptText;

    // Step 3: Generate final answer
    const text = await callGeminiWithFallback(contents, getSystemPrompt(mode));

    logger.info('✅ Response generated successfully using live multi-source research');
    return {
        answer: text,
        sources: {
            searchKeywords: deepResearch.searchKeywords,
            journals: deepResearch.journals,
            news: deepResearch.news,
            courtRulings: deepResearch.courtRulings,
            regulations: deepResearch.regulations,
            encyclopedia: deepResearch.encyclopedia,
            formattedReferences: deepResearch.formattedReferences,
            cached: !!deepResearch.cached
        }
    };
}

/**
 * Backward-compatible text-only response generator (used by WhatsApp messageHandler)
 */
async function generateResponse(question, userName, context = {}) {
    try {
        const { answer, sources } = await generateResponseWithResearch(question, userName, context);

        // Append compact live references for text-only clients (WhatsApp)
        let extra = '';
        if (sources.news.length > 0 || sources.journals.length > 0 || sources.courtRulings.length > 0) {
            extra += '\n\n📚 *Referensi Riset Terkini:*';
            sources.journals.slice(0, 2).forEach(j => { extra += `\n• [Jurnal] ${j.title}${j.url ? ` (${j.url})` : ''}`; });
            sources.news.slice(0, 2).forEach(n => { extra += `\n• [Berita] ${n.title} (${n.authors || 'Berita'})`; });
            sources.courtRulings.slice(0, 2).forEach(c => { extra += `\n• [Pengadilan] ${c.title}`; });
        }
        return answer + extra;
    } catch (error) {
        logger.error(`Gemini API Error: ${error.message}`);

        if (error.message.includes('API key')) {
            return '⚠️ API Key Gemini belum di-set atau tidak valid. Hubungi admin untuk memperbarui konfigurasi.';
        }

        return '⚠️ Maaf, sistem sedang mengalami kendala koneksi AI. Coba lagi sesaat lagi ya!';
    }
}

/**
 * Generate Natural Academic English version enriched with verified research context
 */
async function generateEnglishVersion(question, indonesianAnswer, userName, researchContext = '') {
    try {
        logger.info(`🇬🇧 Generating Natural Academic English version for ${userName}...`);

        const prompt = `Student Name: ${userName}
Original Question: "${question}"

${researchContext ? `Verified Multi-Source Live Research Findings:\n${researchContext}\n\n` : ''}Indonesian Analysis Provided:
"""
${indonesianAnswer}
"""

TASK:
Produce the definitive Natural Academic English version of the above analysis, synthesizing all verified research findings (academic journals, latest news, court rulings, and statutory regulations).
Ensure the terminology is impeccably precise, natural, scholarly, and formatted according to international academic standards without inventing fake URLs or DOIs.`;

        return await callGeminiWithFallback(prompt, getSystemPrompt('english'));
    } catch (error) {
        logger.error(`Error generating English version: ${error.message}`);
        throw error;
    }
}

/**
 * Build comprehensive prompt with multi-source research context across all modes
 */
function buildPrompt(question, userName, references, context) {
    const mode = (context && context.mode) || 'umum';
    let prompt = `Pertanyaan dari mahasiswa bernama ${userName}:\n"${question}"\n\n`;

    if (references) {
        prompt += `HASIL RISET KOMPREHENSIF LANGSUNG (JURNAL ILMIAH, BERITA TERBARU, PUTUSAN PENGADILAN, PERATURAN JDIH & ENSIKLOPEDIA):\n${references}\n\n`;
    }

    if (mode === 'umum') {
        prompt += `INSTRUKSI PENGERJAAN RAMAH, LENGKAP & BERBASIS RISET (DEFAULT MODE):
- Posisikan dirimu sebagai mentor akademis yang ramah, cerdas, dan sangat membantu.
- Jawab pertanyaan secara lengkap, akurat, dan memuaskan dengan merangkum temuan penting dari hasil riset di atas (berita terbaru jika topiknya aktual, temuan jurnal ilmiah, landasan hukum/putusan pengadilan bila relevan, dan konsep dasar ensiklopedia).
- JANGAN memaksakan format kaku IRAC jika pertanyaan tidak menuntut bedah sengketa hukum formal.
- Gunakan bahasa Indonesia yang santun, mengalir, jelas, serta sertakan contoh/analogi nyata dan poin ringkasan untuk tugas.`;
    } else if (mode === 'english') {
        prompt += `ACADEMIC ENGLISH RESEARCH INSTRUCTIONS:
- Synthesize all live research findings above (academic journals, latest news, judicial precedents, statutory regulations, and encyclopedic background) into eloquent Academic English.
- Follow the required structure:
  1. 🎯 *EXECUTIVE SUMMARY (30-SECOND BRIEF)*
  2. 📖 *COMPREHENSIVE ACADEMIC ANALYSIS*
  3. ⚖️ *JUDICIAL PRECEDENTS, COURT DECISIONS & RECENT DEVELOPMENTS*
  4. 📋 *BIBLIOGRAPHY & VERIFIED SOURCES (APA 7TH / BLUEBOOK)*`;
    } else if (mode === 'yurisprudensi') {
        prompt += `INSTRUKSI PENGERJAAN TELAAH PUTUSAN & YURISPRUDENSI:
- Fokus utama pada telaah preseden putusan pengadilan riil (PN, PT, MA, MK) dan kajian putusan dari hasil riset di atas.
- Sajikan: 1) Preseden Putusan & Perkembangan Peradilan Terkait, 2) Duduk Perkara Singkat, 3) Ratio Decidendi (Pertimbangan Hukum Hakim), 4) Kaidah Hukum Tetap yang Terbentuk, 5) Alur Hierarki Hukum, dan 6) Daftar Pustaka terverifikasi.`;
    } else {
        // Mode IRAC / Kasus — Expert Chain-of-Thought Legal Analysis
        prompt += `INSTRUKSI PENGERJAAN ANALISIS KASUS IRAC PAKAR SENIOR:

═══ LANGKAH PRA-ANALISIS (WAJIB DILAKUKAN SEBELUM MENULIS OUTPUT) ═══
1. Klasifikasikan domain hukum: Perdata / Pidana / TUN / Bisnis / Campuran + sub-bidang spesifik.
2. Identifikasi SEMUA teori hukum yang bisa berlaku (Wanprestasi vs PMH, overmacht, dll.) beserta Latin maxim relevan.
3. Petakan setiap fakta kasus ke unsur-unsur pasal yang diterapkan (element-by-element mapping).
4. Antisipasi argumen terkuat pihak lawan dan persiapkan counter-argument yuridis.
5. Referensikan data riset di atas sebagai BUKTI PENDUKUNG:
   - Jurnal ilmiah → sebut sebagai [J-1], [J-2], dst. dalam Application & Rule
   - Berita terkini → sebut sebagai [N-1], [N-2], dst. untuk konteks faktual terkini
   - Peraturan JDIH → sebut sebagai [R-1], [R-2], dst. sebagai dasar hukum positif
   - Putusan pengadilan → sebut sebagai [P-1], [P-2], dst. dalam Telaah Preseden

═══ STRUKTUR OUTPUT IRAC WAJIB ═══
1. 🎯 *RINGKASAN CEPAT — KONKLUSI YURIDIS LANGSUNG*
   → 3-4 poin konkret: pasal utama yang berlaku + konklusi hukum + remedy/solusi.
2. 📖 *PEMBAHASAN MENDALAM METODE IRAC PAKAR SENIOR*
   - I: Isu Hukum primer DAN isu sekunder/turunan
   - R: Pasal positif terkini + doktrin ahli + asas hukum + data jurnal [J-x] dan peraturan [R-x]
   - A: Konfrontasi fakta-pasal element-by-element + argumen & counter-argumen + konteks berita [N-x]
   - C: Konklusi tegas + sanksi/konsekuensi konkret + langkah hukum yang bisa diambil
3. ⚖️ *TELAAH PRESEDEN & YURISPRUDENSI*
   → Gunakan putusan dari riset [P-x]; jika terbatas, jelaskan ratio decidendi konseptual secara analogis.
   → JANGAN mengarang nomor putusan spesifik yang tidak ada dalam data riset.
4. 📋 *DAFTAR PUSTAKA TERVERIFIKASI (SIAP COPAS KE WORD)*
   → Hanya sumber yang nyata dari data riset atau pengetahuan faktual terverifikasi.`;
    }

    return prompt;
}

module.exports = {
    generateResponse,
    generateResponseWithResearch,
    generateEnglishVersion
};
