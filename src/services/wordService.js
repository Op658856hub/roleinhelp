// ===========================================
// Word Document Generator Service (.docx)
// Generates beautifully formatted Microsoft Word documents
// according to Indonesian & International Academic Standards:
// - Body Font: Times New Roman, Size 12 pt, Line Spacing 1.5, Justified
// - Headings & Sub-headings: Times New Roman, Size 14 pt, BOLD
// - Standard Academic Paper Margins: Top 3cm, Left 4cm, Bottom 3cm, Right 3cm (4-4-3-3)
// ===========================================

const fs = require('fs');
const path = require('path');
const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    AlignmentType,
    Footer,
    PageNumber,
    BorderStyle
} = require('docx');
const { logger } = require('../utils/logger');

const DOCS_DIR = path.join(__dirname, '..', '..', 'data', 'documents');

/**
 * Ensure documents directory exists
 */
function ensureDocsDir() {
    if (!fs.existsSync(DOCS_DIR)) {
        fs.mkdirSync(DOCS_DIR, { recursive: true });
    }
}

/**
 * Clean markdown symbols from text
 * @param {string} text 
 * @returns {string}
 */
function cleanText(text) {
    return text
        .replace(/^[#\s*]+/, '')
        .replace(/[*_~`]/g, '')
        .trim();
}

/**
 * Parse text line into TextRuns, preserving inline bolding (**bold** or *bold*)
 * @param {string} line 
 * @param {object} options 
 * @returns {TextRun[]}
 */
function parseInlineFormatting(line, options = {}) {
    const defaultFont = 'Times New Roman';
    const defaultSize = options.size || 24; // 12pt = 24 half-points
    const isHeading = options.isHeading || false;

    // If heading, make the entire line bold and 14pt
    if (isHeading) {
        return [
            new TextRun({
                text: cleanText(line),
                font: defaultFont,
                size: 28, // 14pt = 28 half-points
                bold: true
            })
        ];
    }

    // Split text by bold markers (**text** or *text*)
    const runs = [];
    const parts = line.split(/(\*\*.*?\*\*|\*[^*]+?\*)/g);

    for (const part of parts) {
        if (!part) continue;

        if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('*') && part.endsWith('*'))) {
            const inner = part.replace(/^[*]+|[*]+$/g, '');
            runs.push(
                new TextRun({
                    text: inner,
                    font: defaultFont,
                    size: defaultSize,
                    bold: true
                })
            );
        } else {
            runs.push(
                new TextRun({
                    text: part,
                    font: defaultFont,
                    size: defaultSize,
                    bold: false
                })
            );
        }
    }

    if (runs.length === 0) {
        runs.push(
            new TextRun({
                text: line,
                font: defaultFont,
                size: defaultSize
            })
        );
    }

    return runs;
}

/**
 * Generate a standard academic Word document from an Op65 answer
 * @param {object} param0 
 * @returns {Promise<{ filePath: string, fileName: string }>}
 */
async function generateAcademicWordDocument({ question, answer, userName, university, faculty, isEnglish = false }) {
    ensureDocsDir();

    const timestamp = Date.now();
    const safeTopic = question
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 30);
    const safeUser = (userName || 'Mahasiswa').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Op65_${safeTopic}_${safeUser}_${timestamp}.docx`;
    const filePath = path.join(DOCS_DIR, fileName);

    logger.info(`📄 Generating academic Word document: ${fileName}...`);

    const children = [];

    // ==========================================
    // 1. INSTITUTIONAL HEADER & TITLE (Academic Header)
    // ==========================================
    children.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: (university || 'PRESIDENT UNIVERSITY').toUpperCase(),
                    font: 'Times New Roman',
                    size: 28, // 14pt
                    bold: true
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 }
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: faculty ? faculty.toUpperCase() : 'FAKULTAS HUKUM / SCHOOL OF LAW',
                    font: 'Times New Roman',
                    size: 24, // 12pt
                    bold: true
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 }
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: isEnglish ? 'LEGAL ACADEMIC ANALYSIS & RESEARCH DOSSIER' : 'KAJIAN AKADEMIS HUKUM & ANALISIS PUTUSAN PENGADILAN',
                    font: 'Times New Roman',
                    size: 22, // 11pt
                    italics: true
                })
            ],
            alignment: AlignmentType.CENTER,
            border: {
                bottom: {
                    style: BorderStyle.SINGLE,
                    size: 12,
                    color: '333333'
                }
            },
            spacing: { after: 300 }
        })
    );

    // ==========================================
    // 2. METADATA BLOCK
    // ==========================================
    const dateFormatted = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    children.push(
        new Paragraph({
            children: [
                new TextRun({ text: isEnglish ? 'Student Name\t: ' : 'Nama Mahasiswa\t: ', font: 'Times New Roman', size: 24, bold: true }),
                new TextRun({ text: `${userName}\n`, font: 'Times New Roman', size: 24 }),
                new TextRun({ text: isEnglish ? 'Institution\t\t: ' : 'Perguruan Tinggi\t: ', font: 'Times New Roman', size: 24, bold: true }),
                new TextRun({ text: `${university || 'President University'}\n`, font: 'Times New Roman', size: 24 }),
                new TextRun({ text: isEnglish ? 'Core Topic\t\t: ' : 'Pokok Bahasan\t: ', font: 'Times New Roman', size: 24, bold: true }),
                new TextRun({ text: `"${question}"\n`, font: 'Times New Roman', size: 24, italics: true }),
                new TextRun({ text: isEnglish ? 'Date\t\t\t: ' : 'Tanggal Kajian\t: ', font: 'Times New Roman', size: 24, bold: true }),
                new TextRun({ text: `${dateFormatted}\n`, font: 'Times New Roman', size: 24 }),
                new TextRun({ text: isEnglish ? 'Academic Engine\t: ' : 'Analisis AI\t\t: ', font: 'Times New Roman', size: 24, bold: true }),
                new TextRun({ text: 'Op65-Agent (Dual-Stream Academic & Judicial AI)', font: 'Times New Roman', size: 24 })
            ],
            alignment: AlignmentType.LEFT,
            spacing: { line: 320, after: 360 }
        })
    );

    // Divider Line
    children.push(
        new Paragraph({
            border: {
                bottom: {
                    style: BorderStyle.DOUBLE,
                    size: 16,
                    color: '111111'
                }
            },
            spacing: { after: 300 }
        })
    );

    // ==========================================
    // 3. BODY CONTENT PARSING
    // - Headings: 14pt, Bold, Times New Roman
    // - Body text: 12pt, Times New Roman, Line spacing 1.5, Justified
    // ==========================================
    const rawLines = answer.split('\n');

    for (let rawLine of rawLines) {
        let line = rawLine.trim();

        // Skip follow-up prompt lines in document
        if (line.includes('Gimana') && line.includes('udah pas belum')) continue;
        if (line.includes('!english') || line.includes('!word')) continue;
        if (line.includes('━━━━━━━━━━━━━━━━━━━━━')) continue;
        if (!line) {
            continue;
        }

        const isHeadingLine = line.startsWith('#') ||
            line.startsWith('###') ||
            line.startsWith('##') ||
            line.startsWith('🎯') ||
            line.startsWith('📖') ||
            line.startsWith('⚖️') ||
            line.startsWith('📋') ||
            /^(ringkasan cepat|executive summary|pembahasan mendalam|comprehensive academic|telaah putusan|judicial precedent|daftar pustaka|bibliography|kesimpulan|conclusion)/i.test(line) ||
            /^(i\.|ii\.|iii\.|iv\.|v\.|bab\s+[i|v|x]+)/i.test(line);

        if (isHeadingLine) {
            // Heading: 14pt, Bold, Times New Roman
            children.push(
                new Paragraph({
                    children: parseInlineFormatting(line, { isHeading: true, size: 28 }),
                    alignment: AlignmentType.LEFT,
                    spacing: { before: 240, after: 120 } // 12pt before, 6pt after
                })
            );
        } else if (line.startsWith('*   ') || line.startsWith('- ') || line.startsWith('• ') || /^\d+\.\s+/.test(line)) {
            // Bullet / Numbered List: 12pt, Times New Roman
            const listText = line.replace(/^[*•-]\s+/, '').replace(/^\d+\.\s+/, '');
            const prefix = /^\d+\.\s+/.test(line) ? line.match(/^\d+\.\s+/)[0] : '• ';

            children.push(
                new Paragraph({
                    children: [
                        new TextRun({ text: prefix, font: 'Times New Roman', size: 24, bold: true }),
                        ...parseInlineFormatting(listText, { size: 24 })
                    ],
                    alignment: AlignmentType.JUSTIFIED,
                    indent: { left: 400 },
                    spacing: { line: 360, after: 80 } // 1.5 line spacing
                })
            );
        } else {
            // Body Paragraph: 12pt, Times New Roman, 1.5 Line Spacing, Justified
            children.push(
                new Paragraph({
                    children: parseInlineFormatting(line, { size: 24 }),
                    alignment: AlignmentType.JUSTIFIED,
                    spacing: { line: 360, after: 140 } // 1.5 line spacing (360 dxa)
                })
            );
        }
    }

    // ==========================================
    // 4. CLOSING STATEMENT / FOOTER
    // ==========================================
    children.push(
        new Paragraph({
            border: {
                top: {
                    style: BorderStyle.SINGLE,
                    size: 8,
                    color: '888888'
                }
            },
            children: [
                new TextRun({
                    text: isEnglish
                        ? 'Generated automatically by Op65-Agent. Complies with President University Academic & Formatting Standards.'
                        : 'Disusun secara otomatis oleh Op65-Agent. Memenuhi Standar Akademis & Format Makalah Ilmiah President University.',
                    font: 'Times New Roman',
                    size: 20, // 10pt
                    italics: true
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 300, after: 100 }
        })
    );

    // ==========================================
    // 5. ASSEMBLE DOCUMENT (A4 & 4-4-3-3 Margins)
    // ==========================================
    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: {
                        font: 'Times New Roman',
                        size: 24 // 12pt default
                    }
                }
            }
        },
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: 1701,    // 3.0 cm
                            left: 2268,   // 4.0 cm
                            bottom: 1701, // 3.0 cm
                            right: 1701   // 3.0 cm
                        }
                    }
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: 'Halaman ',
                                        font: 'Times New Roman',
                                        size: 20
                                    }),
                                    new TextRun({
                                        children: [PageNumber.CURRENT],
                                        font: 'Times New Roman',
                                        size: 20
                                    })
                                ],
                                alignment: AlignmentType.CENTER
                            })
                        ]
                    })
                },
                children: children
            }
        ]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);

    logger.info(`✅ Successfully created Word document: ${filePath} (${buffer.length} bytes)`);

    return {
        filePath,
        fileName
    };
}

module.exports = {
    generateAcademicWordDocument
};
