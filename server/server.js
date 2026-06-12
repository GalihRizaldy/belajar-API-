// Load environment variables dari file .env (direkomendasikan diletakkan di root atau sesuaikan path-nya)
require('dotenv').config();

// Mengimpor module express dan cors
const express = require('express');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;

// Konfigurasi Cloudinary menggunakan environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Inisialisasi aplikasi Express
const app = express();
const PORT = 3000;

// Agar Express mendeteksi protokol HTTPS jika berada di belakang Reverse Proxy (seperti Nginx/Vercel)
app.set('trust proxy', true);

// Menggunakan middleware cors agar client (origin lain) bisa mengakses API
app.use(cors());

// Middleware untuk mem-parsing body berformat JSON
app.use(express.json());

// Konfigurasi Multer untuk menyimpan file ke folder uploads (Maksimal 50 MB)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Folder tujuan
    },
    filename: (req, file, cb) => {
        // Penamaan file unik (timestamp + ekstensi asli)
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // Batas ukuran 50 MB
});

// Membuka folder uploads agar bisa diakses secara publik oleh client
app.use('/uploads', express.static('uploads'));

// Variabel memori sementara untuk menyimpan pesan, URL gambar, dan URL video (berupa Array History)
let historyPesan = [{ pesan: "Halo! Tetap semangat belajar coding. Kamu pasti bisa!", waktu: new Date().toString() }];
let historyGambar = [];
let historyVideo = [];
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
    // Mengirim response seluruh history
    res.status(200).json({ history: historyPesan });
});

// Membuat endpoint POST /api/pesan untuk mengupdate pesan
app.post('/api/pesan', (req, res) => {
    // Mengambil pesan baru dari body request
    const { pesan } = req.body;
    
    if (pesan) {
        historyPesan.push({ pesan: pesan, waktu: new Date().toString() }); // Menambah pesan ke dalam array
        res.status(200).json({ status: "sukses", message: "Pesan berhasil ditambahkan ke riwayat!" });
    } else {
        res.status(400).json({ status: "gagal", message: "Pesan tidak boleh kosong." });
    }
});

// Endpoint untuk mendapatkan riwayat gambar
app.get('/api/gambar', (req, res) => {
    res.status(200).json({ history: historyGambar });
});

// Endpoint untuk mengupload gambar baru ke Cloudinary
app.post('/api/upload', upload.single('gambar'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: "gagal", message: "Tidak ada file yang diupload." });
    }
    
    try {
        // Upload gambar dari penyimpanan lokal sementara ke Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'belajar-api/gambar'
        });
        
        // Hapus file sementara di lokal setelah berhasil di-upload
        fs.unlinkSync(req.file.path);
        
        // Simpan ke dalam array riwayat
        historyGambar.push({ url: result.secure_url, waktu: new Date().toString() });
        
        res.status(200).json({ status: "sukses", message: "Gambar berhasil ditambahkan ke riwayat Cloudinary!" });
    } catch (error) {
        console.error("Error upload ke Cloudinary:", error);
        
        // Pastikan file lokal terhapus meskipun proses upload gagal
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ status: "gagal", message: "Gagal mengupload gambar ke Cloudinary." });
    }
});

// Endpoint untuk mendapatkan riwayat video
app.get('/api/video', (req, res) => {
    res.status(200).json({ history: historyVideo });
});

// Endpoint untuk mengecek status konversi video
app.get('/api/video-status', (req, res) => {
    res.status(200).json({ status: statusVideo });
});

// Endpoint untuk mengupload video baru (dan mengkonversi ke HLS di Cloudinary secara Asinkron)
app.post('/api/upload-video', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: "gagal", message: "Tidak ada file video yang diupload." });
    }
    
    // Ubah status menjadi processing
    statusVideo = 'processing';
    
    // MENGIRIM RESPON SEGERA (Status 202 Accepted) agar frontend bisa polling
    res.status(202).json({ 
        status: "processing", 
        message: "Video berhasil diupload dan sedang dikonversi di Cloudinary (latar belakang)." 
    });
    
    // Proses asinkron upload ke Cloudinary
    cloudinary.uploader.upload(req.file.path, {
        resource_type: "video",
        folder: "belajar-api/video",
        eager: [
            { streaming_profile: "hd", format: "m3u8" }
        ],
        eager_async: true
    }).then(result => {
        console.log('Upload video Cloudinary selesai! HLS sedang di-generate di latar belakang Cloudinary.');
        
        // Kita menggunakan cloudinary.url() untuk merakit URL HLS (.m3u8) secara pasti
        // meskipun proses transformasinya masih berjalan di latar belakang Cloudinary.
        const generatedUrl = cloudinary.url(result.public_id, { 
            resource_type: "video", 
            format: "m3u8", 
            streaming_profile: "hd", 
            secure: true 
        });
        
        // Push ke dalam array history
        historyVideo.push({ url: generatedUrl, waktu: new Date().toString() });
        statusVideo = 'ready';
        
        // Hapus file mentah lokal
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
    }).catch(error => {
        console.error("Error upload video ke Cloudinary:", error);
        statusVideo = 'error';
        
        // Hapus file mentah lokal jika gagal
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
    });
});

// Endpoint untuk mendapatkan versi aplikasi
app.get('/api/version', (req, res) => {
    try {
        const pkgPath = path.join(__dirname, '../package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        res.status(200).json({ version: pkg.version });
    } catch (e) {
        res.status(200).json({ version: '1.1.01' }); // Fallback
    }
});

// Menjalankan server pada port yang ditentukan
app.listen(PORT, () => {
    console.log(`Server sedang berjalan di http://localhost:${PORT}`);
});
