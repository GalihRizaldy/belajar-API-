# Belajar API 🚀

Sebuah proyek edukasi untuk mempelajari dasar-dasar **RESTful API**, **File Uploads**, dan **Video Transcoding (HLS)** menggunakan Node.js dan Express, dilengkapi dengan antarmuka web modern bergaya *Glassmorphism*.

## 🌟 Fitur Utama
- **REST API Dasar**: Manipulasi teks dan data JSON sederhana.
- **Upload Gambar**: Menangani file biner menggunakan `multer`.
- **HLS Video Streaming**: Mengunggah video besar, lalu dicincang (*transcoding*) menjadi format HLS (`.m3u8` & `.ts`) menggunakan **FFmpeg** secara asinkron (*Background Jobs*).
- **Polling Otomatis**: *Frontend* secara otomatis mengecek status konversi video ke server secara berkala tanpa me-refresh halaman.
- **Dual UI**: Memiliki 2 tampilan antarmuka (Klasik dan Modern Glassmorphism).

## 🛠️ Teknologi yang Digunakan
*   **Backend**: Node.js, Express.js, Multer
*   **Video Processing**: FFmpeg (`@ffmpeg-installer/ffmpeg` & `fluent-ffmpeg`)
*   **Frontend**: HTML5, Vanilla CSS, HLS.js
*   **Deployment Tools**: Mendukung `npm ci` (terdapat `package-lock.json` di root) dan konfigurasi dasar `vercel.json`.

## 📁 Struktur Folder
```text
📦 Belajar API
 ┣ 📂 client                 # Kode Frontend (UI)
 ┃ ┣ 📜 index.html           # UI Klasik (Polos)
 ┃ ┗ 📜 modern.html          # UI Modern (iOS Glassmorphism)
 ┣ 📂 server                 # Kode Backend (API)
 ┃ ┣ 📂 uploads              # Tempat penyimpanan file upload & HLS (Diabaikan oleh Git)
 ┃ ┗ 📜 server.js            # Inti logika server (Express)
 ┣ 📜 package.json           # Konfigurasi dependensi utama
 ┣ 📜 package-lock.json      # Versi library yang terkunci (Untuk npm ci)
 ┣ 📜 vercel.json            # Konfigurasi deployment Frontend Vercel
 ┗ 📜 .gitignore             # Mengabaikan node_modules & isi file uploads/
```

## 🚀 Cara Menjalankan Secara Lokal

1. **Clone Repository ini**
   ```bash
   git clone https://github.com/GalihRizaldy/belajar-API-.git
   cd belajar-API-
   ```

2. **Install Dependensi**
   Proyek ini menggunakan struktur satu `package.json` utama. Instal semua modul dengan:
   ```bash
   npm install
   ```

3. **Jalankan Server**
   ```bash
   npm start
   ```
   Server akan menyala di `http://localhost:3000`.

4. **Buka Frontend**
   Buka file `client/modern.html` di web browser kesayangan Anda.
   *(Catatan: Jangan gunakan Live Server saat mencoba fitur upload video, karena Live Server akan memicu refresh paksa setiap kali FFmpeg menghasilkan pecahan file .ts).*

## 📡 Daftar API Endpoint

| Method | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| `GET` | `/api/pesan` | Mengambil teks pesan penyemangat dan waktu server |
| `POST` | `/api/pesan` | Mengubah teks pesan penyemangat |
| `GET` | `/api/gambar` | Mengambil URL gambar terbaru yang di-upload |
| `POST` | `/api/upload` | Mengunggah file gambar (Multipart Form-Data) |
| `POST` | `/api/upload-video`| Mengunggah file video, mengembalikan status 202 (Accepted) lalu memproses HLS di belakang layar |
| `GET` | `/api/video-status`| Mengecek apakah FFmpeg sudah selesai memproses video |
| `GET` | `/api/video` | Mengambil URL video `.m3u8` untuk HLS Player |

## ⚠️ Peringatan Deployment (Vercel)
File `vercel.json` di proyek ini dikonfigurasikan agar *frontend* (UI Web) bisa langsung berjalan di Vercel. Namun, **Vercel adalah lingkungan Serverless** yang memiliki limitasi ketat:
- Tidak bisa menulis/menyimpan file lokal ke dalam folder `uploads/` secara permanen.
- Tidak dilengkapi *binary* FFmpeg bawaan.
- Waktu *timeout* eksekusi sangat singkat (maksimal 10 detik).

Jika Anda ingin mendeploy keseluruhan aplikasi (termasuk fitur upload video), sangat disarankan untuk mendeploynya ke layanan **VPS (Virtual Private Server)** seperti DigitalOcean, Linode, atau layanan cloud yang memiliki sistem penyimpanan persisten (*Persistent Disk*) seperti Render / Railway.

---
*Dibuat untuk pembelajaran dan eksplorasi dunia Backend API.* ✨
