# 🤖 Op65-Agent - WhatsApp AI Academic Assistant

> *"Jawaban Daging, Bukan Basa-Basi"* 💪

Created by **Livelyhood Tonggo Tua Sinaga** (Felik Sinaga)  
🎓 Mahasiswa Hukum - President University  
🥋 Atlet Karate Nasional Indonesia (INKAI Black Belt DAN I)

---

## 📖 Apa itu Op65-Agent?

Op65-Agent adalah bot WhatsApp bertenaga AI yang dirancang khusus untuk membantu menjawab soal-soal akademis. Bot ini:

- 🔍 **Research dulu, jawab kemudian** - Otomatis search Google Scholar untuk cari jurnal/paper yang relevan sebelum menjawab
- 📚 **Jawaban kualitas akademisi** - Padat, berisi, pake referensi, gak bertele-tele
- 🤝 **Kenal dulu, baru bantu** - User harus kenalan dulu sebelum bisa minta bantuan
- 💬 **Bahasa natural** - Jawaban akademis tapi dengan gaya bahasa yang santai dan mudah dipahami

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+ (disarankan v20+)
- WhatsApp account yang aktif

### 1. Clone & Install

```bash
cd Agent_Op65
npm install
```

### 2. Setup Environment

```bash
# Copy example env
copy .env.example .env

# Edit .env dan masukkan API key
notepad .env
```

Isi `.env`:
```
GEMINI_API_KEY=your_gemini_api_key_here
OWNER_NAME=Livelyhood Tonggo Tua Sinaga
OWNER_PHONE=6281234567890
BOT_PREFIX=!op65
BOT_NAME=Op65-Agent
```

> 💡 Dapatkan Gemini API Key gratis di: https://aistudio.google.com/apikey

### 3. Run the Bot

```bash
npm start
```

### 4. Scan QR Code
Scan QR code yang muncul di terminal pakai WhatsApp kamu (Settings → Linked Devices → Link a Device)

---

## 📋 Commands

| Command | Keterangan |
|---------|-----------|
| `!op65 kenalan [Nama] \| [Univ] \| [Jurusan]` | Daftar/kenalan |
| `!op65 [pertanyaan]` | Tanya soal akademis |
| `!op65 help` | Tampilkan menu bantuan |
| `!op65 status` | Cek status bot |
| `!op65 listcontacts` | List semua contacts (owner only) |

### Contoh Penggunaan

**Kenalan dulu:**
```
!op65 kenalan Budi Santoso | President University | Hukum
```

**Tanya soal:**
```
!op65 Jelaskan teori kedaulatan menurut Jean Bodin dan hubungannya dengan konstitusi modern
```

**Di group chat, bisa juga:**
```
Op65 tolong jelaskan perbedaan hukum perdata dan hukum pidana
```

---

## 🏗️ Project Structure

```
Agent_Op65/
├── src/
│   ├── index.js                 # Entry point
│   ├── handlers/
│   │   └── messageHandler.js    # Message routing & commands
│   ├── services/
│   │   ├── geminiService.js     # Gemini AI integration
│   │   ├── scholarService.js    # Google Scholar research
│   │   └── contactManager.js    # Contact/user management
│   └── utils/
│       └── logger.js            # Logging utility
├── data/
│   └── contacts.json            # Saved contacts (auto-generated)
├── .env.example                 # Environment template
├── .gitignore
├── package.json
└── README.md
```

---

## 🔧 Tech Stack

- **Runtime:** Node.js
- **WhatsApp:** whatsapp-web.js (Puppeteer-based)
- **AI Engine:** Google Gemini 2.0 Flash
- **Research:** Google Scholar (web scraping)
- **Auth:** QR Code via WhatsApp Web

---

## ⚠️ Disclaimer

Bot ini dibuat untuk tujuan edukasi dan membantu proses belajar. Gunakan dengan bijak dan tetap kerjakan tugas sendiri. Op65-Agent adalah tools untuk *membantu memahami*, bukan untuk *menggantikan* proses belajar.

---

## 📄 License

MIT License - Livelyhood Tonggo Tua Sinaga © 2026
