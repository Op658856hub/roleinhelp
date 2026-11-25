// ===========================================
// Comprehensive Multi-Source Research Service (v2)
// Features:
// - Per-source query planning & Indonesian legal/academic acronym expansion
// - Parallel 5-stream research: Academic Journals, Latest News, Court Rulings,
//   Indonesian Statutory Regulations (JDIH BPK), and Encyclopedia (Wikipedia)
// - Relevance scoring/filtering to eliminate keyword noise
// - In-memory TTL cache (15 min) for speed & rate-limit protection
// ===========================================

const { logger } = require('../utils/logger');

const FETCH_TIMEOUT_MS = 5500;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
const USER_AGENT = 'RoleInHelp-ResearchBot/2.1 (mailto:research@roleinhelp.local)';

const researchCache = new Map();

const STOP_WORDS = new Set([
    'apa', 'apakah', 'siapa', 'dimana', 'kapan', 'mengapa', 'kenapa', 'bagaimana', 'gimana',
    'yang', 'dimaksud', 'dengan', 'adalah', 'ialah', 'merupakan', 'yaitu', 'yakni',
    'jelaskan', 'uraikan', 'sebutkan', 'tuliskan', 'berikan', 'contoh', 'tolong', 'bantu',
    'jawab', 'jawabkan', 'soal', 'pertanyaan', 'dong', 'nih', 'sih', 'deh',
    'bro', 'gan', 'sis', 'kak', 'bang', 'mas', 'mba', 'dari', 'pada', 'dalam', 'untuk',
    'oleh', 'atau', 'dan', 'serta', 'tetapi', 'tapi', 'namun', 'jika', 'bila', 'kalau',
    'sebab', 'akibat', 'terhadap', 'tentang', 'mengenai', 'secara', 'bisa', 'dapat',
    'harus', 'wajib', 'boleh', 'akan', 'sudah', 'telah', 'sedang', 'belum',
    'paling', 'seperti', 'antara', 'sebagai', 'menurut', 'terbaru', 'terkini',
    'terkait', 'sekarang', 'saat', 'ini', 'itu', 'tersebut', 'nya', 'kita', 'kami', 'saya', 'aku',
    'kamu', 'mereka', 'ada', 'tidak', 'bukan', 'tanpa', 'carikan', 'bikinin', 'buatkan', 'hal',
    'di', 'ke', 'perkembangan', 'kajian', 'uraian', 'lengkap',
    'please', 'help', 'what', 'why', 'how', 'when', 'where', 'who', 'which', 'the', 'is',
    'are', 'was', 'were', 'and', 'or', 'for', 'with', 'about', 'into', 'from', 'that',
    'this', 'explain', 'analyze', 'describe', 'give', 'example', 'latest', 'news'
    // NOTE: kata-kata seperti 'masih', 'sangat', 'karena', 'lebih', 'kasus', 'indonesia'
    // SENGAJA tidak di-stop agar pertanyaan non-hukum tidak kehilangan konteks
]);

const MODIFIER_WORDS = new Set([
    // Modifier hukum — boleh dibuang jika ada term lebih spesifik
    'putusan', 'pengadilan', 'aturan', 'hukumnya', 'yurisprudensi', 'vonis', 'preseden',
    // Modifier umum yang tidak menambah nilai query
    'studi', 'tinjauan', 'implementasi', 'penerapan'
    // NOTE: 'dampak', 'pengaruh', 'kebijakan', 'indonesia', 'sistem' SENGAJA tidak
    // dibuang karena relevan untuk pertanyaan ekonomi/sosial/teknologi/sains
]);

const ACRONYM_MAP = {
    // Hukum & Regulasi
    'ppn': 'pajak pertambahan nilai',
    'pph': 'pajak penghasilan',
    'pmh': 'perbuatan melawan hukum',
    'kuhp': 'kitab undang-undang hukum pidana',
    'kuhperdata': 'kitab undang-undang hukum perdata',
    'kuhap': 'hukum acara pidana',
    'phk': 'pemutusan hubungan kerja',
    'pkwt': 'perjanjian kerja waktu tertentu',
    'umkm': 'usaha mikro kecil menengah',
    'ham': 'hak asasi manusia',
    'ojk': 'otoritas jasa keuangan',
    'kpk': 'komisi pemberantasan korupsi',
    'mk': 'mahkamah konstitusi',
    'ma': 'mahkamah agung',
    'bpk': 'badan pemeriksa keuangan',
    'bumn': 'badan usaha milik negara',
    'apbn': 'anggaran pendapatan belanja negara',
    'uud': 'undang-undang dasar',
    // Teknologi & Sains
    'ai': 'kecerdasan buatan',
    'ml': 'machine learning pembelajaran mesin',
    'iot': 'internet of things',
    'it': 'teknologi informasi',
    // Ekonomi
    'gdp': 'produk domestik bruto',
    'pdb': 'produk domestik bruto',
    'bi': 'bank indonesia',
    'ihsg': 'indeks harga saham gabungan',
    'umr': 'upah minimum regional',
    'umk': 'upah minimum kabupaten',
    'uak': 'uang pesangon',
};

const PHRASE_EXPANSIONS = [
    [/\buu\s+hpp\b/gi, 'harmonisasi peraturan perpajakan'],
    [/\buu\s+ite\b/gi, 'informasi transaksi elektronik'],
    [/\buu\s+pdp\b/gi, 'pelindungan data pribadi'],
    [/\buu\s+cipta\s+kerja\b/gi, 'cipta kerja'],
    [/\bgenerative\s+ai\b/gi, 'kecerdasan buatan generatif']
];

/**
 * Decode basic HTML/XML entities and strip tags
 */
function cleanText(str) {
    if (!str) return '';
    return String(str)
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Reconstruct plain abstract snippet from OpenAlex inverted index
 */
function reconstructAbstract(invertedIndex, maxChars = 420) {
    if (!invertedIndex || typeof invertedIndex !== 'object') return '';
    const words = [];
    for (const [word, positions] of Object.entries(invertedIndex)) {
        if (!Array.isArray(positions)) continue;
        for (const pos of positions) {
            words[pos] = word;
        }
    }
    const text = words.filter(Boolean).join(' ').trim();
    return text.length > maxChars ? text.slice(0, maxChars).trim() + '…' : text;
}

/**
 * Deduplicate array of items by normalized key
 */
function deduplicateBy(items, getKey) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const key = (getKey(item) || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

/**
 * Extract smart search keywords from any random Indonesian or English question
 */
function extractSmartKeywords(question) {
    if (!question || typeof question !== 'string') return '';
    const cleaned = question
        .toLowerCase()
        .replace(/[^\p{L}\p{N}%\/\-\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const tokens = cleaned.split(' ').filter(w => w.length > 1 && !STOP_WORDS.has(w));
    if (tokens.length === 0) {
        return question.trim().slice(0, 80);
    }
    return tokens.slice(0, 6).join(' ');
}

/**
 * Build tailored per-source queries and relevance core terms from user question
 */
function buildSourceQueries(question) {
    const raw = (question || '').toLowerCase();
    let expanded = raw;
    for (const [pattern, replacement] of PHRASE_EXPANSIONS) {
        expanded = expanded.replace(pattern, replacement);
    }

    const baseTokens = expanded
        .replace(/[^\p{L}\p{N}%\/\-\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(w => w.length > 1 && !STOP_WORDS.has(w));

    // Core subject tokens exclude broad modifiers when more specific terms exist
    const specificTokens = baseTokens.filter(w => !MODIFIER_WORDS.has(w) && !/^\d+%?$/.test(w));
    const coreTokens = specificTokens.length > 0
        ? specificTokens
        : baseTokens.filter(w => !/^\d+%?$/.test(w));

    const expandedCoreTokens = [];
    for (const t of coreTokens) {
        if (ACRONYM_MAP[t]) {
            expandedCoreTokens.push(...ACRONYM_MAP[t].split(' '));
        } else {
            expandedCoreTokens.push(t);
        }
    }

    const uniqueCore = Array.from(new Set(expandedCoreTokens)).slice(0, 4);
    const generalTokens = baseTokens.slice(0, 5);

    const wikiQuery = uniqueCore.length > 0 ? uniqueCore.join(' ') : extractSmartKeywords(question);
    const regQuery = uniqueCore.length > 0 ? uniqueCore.join(' ') : wikiQuery;
    const journalQuery = (specificTokens.length >= 2 ? specificTokens : generalTokens).slice(0, 4).join(' ') || wikiQuery;
    const newsQuery = generalTokens.slice(0, 4).join(' ') || wikiQuery;
    const courtBaseTokens = (specificTokens.length > 0 ? specificTokens : baseTokens)
        .filter(w => !/^(putusan|pengadilan|vonis|mahkamah|hakim)$/i.test(w))
        .slice(0, 4);
    const courtQuery = courtBaseTokens.join(' ') || wikiQuery;

    // Keywords used for relevance scoring
    const matchTerms = Array.from(new Set([
        ...coreTokens.filter(t => t.length >= 2),
        ...uniqueCore.filter(t => t.length >= 3)
    ]));

    return {
        displayKeywords: generalTokens.join(' ') || wikiQuery,
        wikiQuery,
        regQuery,
        journalQuery,
        newsQuery,
        courtQuery,
        matchTerms
    };
}

/**
 * Score & filter candidate results against core subject terms to remove off-topic noise
 */
function filterAndRankByRelevance(items, matchTerms, options = {}) {
    if (!items || items.length === 0) return [];
    if (!matchTerms || matchTerms.length === 0) return items;

    const minScore = options.strict ? 1 : 0;
    const scored = items.map(item => {
        const titleLower = (item.title || '').toLowerCase();
        const snippetLower = (item.snippet || '').toLowerCase();
        let score = 0;
        for (const term of matchTerms) {
            if (titleLower.includes(term)) score += 3;
            if (snippetLower.includes(term)) score += 1;
        }
        return { item, score };
    });

    const matched = scored.filter(s => s.score >= (options.strict ? 1 : 1));
    if (matched.length > 0) {
        return matched.sort((a, b) => b.score - a.score).map(s => s.item);
    }

    // If strict (e.g. JDIH BPK or Encyclopedia), return empty rather than noisy wrong law/article
    return minScore > 0 ? [] : items;
}

/**
 * Fetch OpenAlex academic papers
 */
async function searchOpenAlex(query, maxResults = 4) {
    try {
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${maxResults}&sort=relevance_score:desc`;
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || []).map(w => {
            const authors = (w.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean).join(', ');
            const journal = w.primary_location?.source?.display_name || '';
            const year = w.publication_year || '';
            return {
                title: cleanText(w.title),
                authors: [authors, journal, year].filter(Boolean).join(' • '),
                year: String(year),
                snippet: reconstructAbstract(w.abstract_inverted_index, 420),
                url: w.doi || w.id || '',
                source: 'OpenAlex'
            };
        }).filter(item => item.title);
    } catch (err) {
        logger.warn(`OpenAlex fetch failed: ${err.message}`);
        return [];
    }
}

/**
 * Fetch Crossref journal DOIs
 */
async function searchCrossref(query, maxResults = 4) {
    try {
        const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${maxResults}&sort=relevance`;
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.message?.items || []).map(item => {
            const title = cleanText(Array.isArray(item.title) ? item.title[0] : item.title);
            const authors = (item.author || []).slice(0, 2).map(a => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean).join(', ');
            const container = cleanText(Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title']);
            const year = item.published?.['date-parts']?.[0]?.[0] || item.created?.['date-parts']?.[0]?.[0] || '';
            const snippet = cleanText(item.abstract).slice(0, 360);
            return {
                title,
                authors: [authors, container, year].filter(Boolean).join(' • '),
                year: String(year),
                snippet,
                url: item.DOI ? `https://doi.org/${item.DOI}` : (item.URL || ''),
                source: 'Crossref'
            };
        }).filter(item => item.title);
    } catch (err) {
        logger.warn(`Crossref fetch failed: ${err.message}`);
        return [];
    }
}

/**
 * Fetch DOAJ open-access journals
 */
async function searchDoaj(query, maxResults = 4) {
    try {
        const url = `https://doaj.org/api/search/articles/${encodeURIComponent(query)}?pageSize=${maxResults}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || []).map(r => {
            const b = r.bibjson || {};
            const authors = (b.author || []).slice(0, 2).map(a => a.name).filter(Boolean).join(', ');
            const journal = b.journal?.title || '';
            const year = b.year || '';
            const linkObj = (b.link || []).find(l => l.type === 'fulltext') || (b.link || [])[0];
            return {
                title: cleanText(b.title),
                authors: [authors, journal, year].filter(Boolean).join(' • '),
                year: String(year),
                snippet: cleanText(b.abstract).slice(0, 360),
                url: linkObj?.url || '',
                source: 'DOAJ'
            };
        }).filter(item => item.title);
    } catch (err) {
        logger.warn(`DOAJ fetch failed: ${err.message}`);
        return [];
    }
}

/**
 * Search Academic Journals across OpenAlex, Crossref, and DOAJ in parallel
 */
async function searchScholar(query, maxResults = 5, matchTerms = []) {
    logger.info(`🔍 [Jurnal Ilmiah] Multi-source academic search: "${query}"`);
    const [oa, cr, dj] = await Promise.allSettled([
        searchOpenAlex(query, 4),
        searchCrossref(query, 3),
        searchDoaj(query, 4)
    ]);

    const combined = [
        ...(oa.status === 'fulfilled' ? oa.value : []),
        ...(dj.status === 'fulfilled' ? dj.value : []),
        ...(cr.status === 'fulfilled' ? cr.value : [])
    ];
    const deduped = deduplicateBy(combined, item => item.title);
    return filterAndRankByRelevance(deduped, matchTerms, { strict: false }).slice(0, maxResults);
}

/**
 * Parse Google News RSS XML response
 */
function parseGoogleNewsRss(xml, maxResults = 5) {
    const items = [];
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    for (const block of blocks) {
        if (items.length >= maxResults) break;
        const rawTitle = cleanText(block.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
        const link = cleanText(block.match(/<link>([\s\S]*?)<\/link>/)?.[1]);
        const pubDateRaw = cleanText(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]);
        const source = cleanText(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]);

        if (!rawTitle) continue;
        const title = source && rawTitle.endsWith(` - ${source}`)
            ? rawTitle.slice(0, -(` - ${source}`).length).trim()
            : rawTitle;

        let formattedDate = pubDateRaw;
        if (pubDateRaw) {
            const d = new Date(pubDateRaw);
            if (!isNaN(d.getTime())) {
                formattedDate = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
            }
        }

        items.push({
            title,
            publisher: source || 'Berita Nasional',
            date: formattedDate,
            authors: [source, formattedDate].filter(Boolean).join(' • '),
            url: link,
            source: 'Google News'
        });
    }
    return items;
}

/**
 * Search Latest News via Google News RSS
 */
async function searchLatestNews(query, maxResults = 4, lang = 'id') {
    logger.info(`📰 [Berita Terbaru] Searching news: "${query}" [${lang}]`);
    try {
        const params = lang === 'en'
            ? 'hl=en-US&gl=US&ceid=US:en'
            : 'hl=id&gl=ID&ceid=ID:id';
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${params}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseGoogleNewsRss(xml, maxResults);
    } catch (err) {
        logger.warn(`News RSS fetch failed: ${err.message}`);
        return [];
    }
}

/**
 * Search Court Decisions, Judicial Rulings & Jurisprudence
 */
async function searchCourtRulings(query, maxResults = 4, matchTerms = []) {
    logger.info(`⚖️ [Putusan & Yurisprudensi] Searching court rulings & jurisprudence for: "${query}"`);
    const courtRssQuery = `(putusan OR "mahkamah agung" OR "mahkamah konstitusi" OR "pengadilan negeri" OR vonis) ${query}`;
    const jurisprudenceQuery = `putusan pengadilan ${query}`;

    const [rssRes, oaRes, doajRes] = await Promise.allSettled([
        searchLatestNews(courtRssQuery, 4, 'id'),
        searchOpenAlex(jurisprudenceQuery, 3),
        searchDoaj(jurisprudenceQuery, 3)
    ]);

    const combined = [
        ...(rssRes.status === 'fulfilled' ? rssRes.value : []),
        ...(oaRes.status === 'fulfilled' ? oaRes.value : []),
        ...(doajRes.status === 'fulfilled' ? doajRes.value : [])
    ];
    const deduped = deduplicateBy(combined, item => item.title);
    return filterAndRankByRelevance(deduped, matchTerms, { strict: false }).slice(0, maxResults);
}

/**
 * Search Indonesian Statutory Regulations via JDIH BPK RI
 */
async function searchRegulations(query, maxResults = 3, matchTerms = []) {
    logger.info(`📜 [Peraturan JDIH BPK] Searching laws/regulations for: "${query}"`);
    try {
        const url = `https://peraturan.bpk.go.id/Search?keywords=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
        if (!res.ok) return [];
        const html = await res.text();

        const regex = /href="(\/Details\/\d+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        const grouped = new Map();
        let match;
        while ((match = regex.exec(html)) !== null) {
            const path = match[1];
            const label = cleanText(match[2]);
            if (!label || label.length < 3 || /^download|lihat|detail$/i.test(label)) continue;
            if (!grouped.has(path)) grouped.set(path, []);
            const arr = grouped.get(path);
            if (!arr.includes(label)) arr.push(label);
        }

        const results = [];
        for (const [path, parts] of grouped.entries()) {
            results.push({
                title: parts.join(' — '),
                url: `https://peraturan.bpk.go.id${path}`,
                source: 'JDIH BPK RI'
            });
        }
        // Strictly filter so unrelated statute numbers (e.g. "Nomor 12") don't slip through
        return filterAndRankByRelevance(results, matchTerms, { strict: true }).slice(0, maxResults);
    } catch (err) {
        logger.warn(`BPK JDIH fetch failed: ${err.message}`);
        return [];
    }
}

/**
 * Search Wikipedia (ID with EN fallback) for general/encyclopedic background
 */
async function searchEncyclopedia(query, maxResults = 2, matchTerms = []) {
    async function queryWiki(lang) {
        try {
            const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts|info&inprop=url&exintro=1&explaintext=1&exchars=900&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=4&format=json`;
            const res = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
            });
            if (!res.ok) return [];
            const data = await res.json();
            const pages = Object.values(data.query?.pages || {});
            return pages
                .sort((a, b) => (a.index || 99) - (b.index || 99))
                .map(p => ({
                    title: cleanText(p.title),
                    snippet: cleanText(p.extract),
                    url: p.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
                    source: `Wikipedia (${lang.toUpperCase()})`
                }))
                .filter(item => item.title && item.snippet);
        } catch (err) {
            return [];
        }
    }

    const idRes = filterAndRankByRelevance(await queryWiki('id'), matchTerms, { strict: true });
    if (idRes.length > 0) return idRes.slice(0, maxResults);
    const enRes = filterAndRankByRelevance(await queryWiki('en'), matchTerms, { strict: true });
    if (enRes.length > 0) return enRes.slice(0, maxResults);

    // Relax strictness only if strict filter found nothing in both languages
    const idRelaxed = await queryWiki('id');
    if (idRelaxed.length > 0) return idRelaxed.slice(0, maxResults);
    return (await queryWiki('en')).slice(0, maxResults);
}

/**
 * Read/write in-memory TTL cache
 */
function getCachedResearch(key) {
    const entry = researchCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        researchCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCachedResearch(key, data) {
    if (researchCache.size >= CACHE_MAX_ENTRIES) {
        const oldestKey = researchCache.keys().next().value;
        researchCache.delete(oldestKey);
    }
    researchCache.set(key, { timestamp: Date.now(), data });
}

/**
 * Comprehensive Multi-Source Research Orchestrator (v2)
 */
async function performDeepLegalResearch(rawQuery, options = {}) {
    const q = buildSourceQueries(rawQuery);
    if (!q.displayKeywords && !q.wikiQuery) {
        return {
            searchKeywords: '',
            journals: [],
            news: [],
            courtRulings: [],
            regulations: [],
            encyclopedia: [],
            formattedReferences: ''
        };
    }

    const newsLang = options.mode === 'english' ? 'en' : 'id';
    const cacheKey = `${newsLang}:${q.wikiQuery}:${q.newsQuery}`;
    const cached = getCachedResearch(cacheKey);
    if (cached) {
        logger.info(`⚡ [Research Cache Hit] Menggunakan hasil riset tersimpan untuk: "${q.displayKeywords}"`);
        return { ...cached, cached: true };
    }

    logger.info(`🌐 [Comprehensive Research v2] Memulai riset 5 sumber (Wiki: "${q.wikiQuery}" | Reg: "${q.regQuery}" | News: "${q.newsQuery}")`);

    const [journalRes, newsRes, courtRes, regRes, wikiRes] = await Promise.allSettled([
        searchScholar(q.journalQuery, 4, q.matchTerms),
        searchLatestNews(q.newsQuery, 4, newsLang),
        searchCourtRulings(q.courtQuery, 4, q.matchTerms),
        searchRegulations(q.regQuery, 3, q.matchTerms),
        searchEncyclopedia(q.wikiQuery, 2, q.matchTerms)
    ]);

    const journals = journalRes.status === 'fulfilled' ? journalRes.value : [];
    const news = newsRes.status === 'fulfilled' ? newsRes.value : [];
    const courtRulings = courtRes.status === 'fulfilled' ? courtRes.value : [];
    const regulations = regRes.status === 'fulfilled' ? regRes.value : [];
    const encyclopedia = wikiRes.status === 'fulfilled' ? wikiRes.value : [];

    logger.info(
        `📚 Research selesai: ${journals.length} Jurnal, ${news.length} Berita Terbaru, ` +
        `${courtRulings.length} Kajian/Berita Pengadilan, ${regulations.length} Peraturan JDIH, ${encyclopedia.length} Ensiklopedia.`
    );

    let formattedReferences = '';

    if (encyclopedia.length > 0) {
        formattedReferences += '🌐 *KONTEKS ENSIKLOPEDIA & PENGETAHUAN UMUM (WIKIPEDIA):*\n';
        encyclopedia.forEach((item, idx) => {
            formattedReferences += `[W-${idx + 1}] ${item.title} (${item.source})\n`;
            if (item.snippet) formattedReferences += `    Ringkasan: ${item.snippet}\n`;
            if (item.url) formattedReferences += `    URL: ${item.url}\n`;
            formattedReferences += '\n';
        });
    }

    if (news.length > 0) {
        formattedReferences += '📰 *BERITA TERBARU & KONTEKS AKTUAL:*\n';
        news.forEach((item, idx) => {
            formattedReferences += `[N-${idx + 1}] ${item.title}\n`;
            if (item.authors) formattedReferences += `    Media & Tanggal: ${item.authors}\n`;
            if (item.url) formattedReferences += `    URL: ${item.url}\n`;
            formattedReferences += '\n';
        });
    }

    if (journals.length > 0) {
        formattedReferences += '📚 *JURNAL ILMIAH & LITERATUR AKADEMIK (OPENALEX / CROSSREF / DOAJ):*\n';
        journals.forEach((item, idx) => {
            formattedReferences += `[J-${idx + 1}] ${item.title}\n`;
            if (item.authors) formattedReferences += `    Penulis/Jurnal: ${item.authors}\n`;
            if (item.snippet) formattedReferences += `    Intisari/Abstrak: ${item.snippet}\n`;
            if (item.url) formattedReferences += `    DOI/URL: ${item.url}\n`;
            formattedReferences += '\n';
        });
    }

    if (courtRulings.length > 0) {
        formattedReferences += '⚖️ *PUTUSAN PENGADILAN & KAJIAN YURISPRUDENSI (MA / MK / PN):*\n';
        courtRulings.forEach((item, idx) => {
            formattedReferences += `[P-${idx + 1}] ${item.title}\n`;
            if (item.authors) formattedReferences += `    Sumber/Tahun: ${item.authors}\n`;
            if (item.snippet) formattedReferences += `    Pokok Kajian: ${item.snippet}\n`;
            if (item.url) formattedReferences += `    URL: ${item.url}\n`;
            formattedReferences += '\n';
        });
    }

    if (regulations.length > 0) {
        formattedReferences += '📜 *PERATURAN PERUNDANG-UNDANGAN TERKAIT (JDIH BPK RI):*\n';
        regulations.forEach((item, idx) => {
            formattedReferences += `[R-${idx + 1}] ${item.title}\n`;
            if (item.url) formattedReferences += `    URL: ${item.url}\n`;
            formattedReferences += '\n';
        });
    }

    if (!formattedReferences) {
        formattedReferences = 'Tidak ada referensi daring eksternal yang cocok langsung; gunakan pengetahuan ilmiah, peraturan positif, dan analisis faktual yang akurat.';
    }

    const result = {
        searchKeywords: q.displayKeywords,
        journals,
        news,
        courtRulings,
        regulations,
        encyclopedia,
        formattedReferences,
        cached: false
    };
    setCachedResearch(cacheKey, result);
    return result;
}

module.exports = {
    extractSmartKeywords,
    buildSourceQueries,
    searchScholar,
    searchLatestNews,
    searchCourtRulings,
    searchRegulations,
    searchEncyclopedia,
    performDeepLegalResearch
};
