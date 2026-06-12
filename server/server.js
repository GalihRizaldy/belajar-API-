// Mengimpor module express dan cors
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Mengatur path FFmpeg dari paket ffmpeg-static
ffmpeg.setFfmpegPath(ffmpegPath);

// Inisialisasi aplikasi Express
const app = express();
const PORT = 3000;

// Agar Express mendeteksi protokol HTTPS jika berada di belakang Reverse Proxy (seperti Nginx/Vercel)
app.set('trust proxy', true);

// Menggunakan middleware cors agar client (origin lain) bisa mengakses API
app.use(cors());

// Middleware untuk mem-parsing body berformat JSON
app.use(express.json());

// Konfigurasi Multer untuk menyimpan file ke folder uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Folder tujuan
    },
    filename: (req, file, cb) => {
        // Penamaan file unik (timestamp + ekstensi asli)
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Membuka folder uploads agar bisa diakses secara publik oleh client
app.use('/uploads', express.static('uploads'));

// Variabel memori sementara untuk menyimpan pesan, URL gambar, dan URL video
let pesanSemangat = "Halo! Tetap semangat belajar coding. Kamu pasti bisa!";
let urlGambar = null; // Awalnya belum ada gambar
let urlVideo = null; // Awalnya belum ada video
let statusVideo = 'none'; // 'none', 'processing', 'ready', 'error'

// Middleware untuk melakukan log setiap kali ada request yang masuk
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] Mendapat request: ${req.method} ${req.url}`);
    next();
});

// Fungsi pembantu untuk mendapatkan Base URL yang anti-gagal (mengatasi isu Nginx aaPanel)
const getBaseUrl = (req) => {
    const host = req.get('x-forwarded-host') || req.get('host');
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    
    // Jika Nginx VPS tidak mengirim header Host, ia akan terbaca sebagai localhost.
    // Kita paksa menggunakan domain production Anda.
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
        return 'https://api1.rizaldy.web.id';
    }
    return `${protocol}://${host}`;
};

// Membuat endpoint GET /api/pesan
app.get('/api/pesan', (req, res) => {
    // Menyiapkan response JSON
    const responseData = {
        pesan: pesanSemangat, // Mengambil dari variabel memori
        waktu: new Date().toString()
    };
    
    // Mengirim response dengan status HTTP 200
    res.status(200).json(responseData);
});

// Membuat endpoint POST /api/pesan untuk mengupdate pesan
app.post('/api/pesan', (req, res) => {
    // Mengambil pesan baru dari body request
    const { pesan } = req.body;
    
    if (pesan) {
        pesanSemangat = pesan; // Menimpa pesan lama dengan yang baru
        res.status(200).json({ status: "sukses", message: "Pesan berhasil diupdate!" });
    } else {
        res.status(400).json({ status: "gagal", message: "Pesan tidak boleh kosong." });
    }
});

// Endpoint untuk mendapatkan URL gambar saat ini
app.get('/api/gambar', (req, res) => {
    if (urlGambar) {
        res.status(200).json({ url: urlGambar });
    } else {
        res.status(404).json({ message: "Belum ada gambar yang diupload." });
    }
});

// Endpoint untuk mengupload gambar baru
app.post('/api/upload', upload.single('gambar'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: "gagal", message: "Tidak ada file yang diupload." });
    }
    
    // Menyimpan path gambar yang bisa diakses client dengan URL dinamis (menyesuaikan domain)
    urlGambar = `${getBaseUrl(req)}/uploads/${req.file.filename}`;
    
    res.status(200).json({ status: "sukses", message: "Gambar berhasil diupload!", url: urlGambar });
});

// Endpoint untuk mendapatkan URL video saat ini
app.get('/api/video', (req, res) => {
    if (urlVideo && statusVideo === 'ready') {
        res.status(200).json({ url: urlVideo });
    } else {
        res.status(404).json({ message: "Belum ada video yang siap diputar." });
    }
});

// Endpoint untuk mengecek status konversi video
app.get('/api/video-status', (req, res) => {
    res.status(200).json({ status: statusVideo });
});

// Endpoint untuk mengupload video baru (dan mengkonversi ke HLS secara Asinkron)
app.post('/api/upload-video', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: "gagal", message: "Tidak ada file video yang diupload." });
    }
    
    // Ubah status menjadi processing
    statusVideo = 'processing';
    urlVideo = null;
    
    // MENGIRIM RESPON SEGERA (Status 202 Accepted) sebelum FFmpeg selesai
    res.status(202).json({ 
        status: "processing", 
        message: "Video berhasil diupload dan sedang dikonversi di latar belakang." 
    });
    
    const inputPath = req.file.path;
    const filenameWithoutExt = path.basename(req.file.filename, path.extname(req.file.filename));
    const hlsFolder = `uploads/hls/${filenameWithoutExt}`;
    if (!fs.existsSync(hlsFolder)){
        fs.mkdirSync(hlsFolder, { recursive: true });
    }

    const outputPath = `${hlsFolder}/index.m3u8`;

    // Mulai proses konversi menggunakan FFmpeg (Berjalan di latar belakang)
    ffmpeg(inputPath)
        .outputOptions([
            '-profile:v baseline', 
            '-level 3.0',
            '-start_number 0',
            '-hls_time 5',         
            '-hls_list_size 0',    
            '-f hls'               
        ])
        .output(outputPath)
        .on('end', () => {
            console.log('Konversi HLS selesai di latar belakang!');
            fs.unlinkSync(inputPath);
            
            // Menyimpan path playlist HLS yang baru dengan URL dinamis (menyesuaikan domain)
            urlVideo = `${getBaseUrl(req)}/${outputPath}`;
            statusVideo = 'ready';
        })
        .on('error', (err) => {
            console.error('Error saat konversi FFmpeg:', err);
            statusVideo = 'error';
        })
        .run();
});

// Menjalankan server pada port yang ditentukan
app.listen(PORT, () => {
    console.log(`Server sedang berjalan di http://localhost:${PORT}`);
});
