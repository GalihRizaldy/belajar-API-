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
const mysql = require('mysql2/promise');

// Konfigurasi koneksi MySQL Database (Pool)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Inisialisasi Database (Auto-create Tables)
async function initDB() {
    try {
        const connection = await pool.getConnection();
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS history_pesan (
                id INT AUTO_INCREMENT PRIMARY KEY,
                pesan TEXT,
                waktu VARCHAR(255)
            )
        `);
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS history_gambar (
                id INT AUTO_INCREMENT PRIMARY KEY,
                url VARCHAR(500),
                waktu VARCHAR(255)
            )
        `);
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS history_video (
                id INT AUTO_INCREMENT PRIMARY KEY,
                url VARCHAR(500),
                waktu VARCHAR(255)
            )
        `);
        
        connection.release();
        console.log("Database tables synchronized successfully.");
    } catch (err) {
        console.error("Error initializing database tables:", err);
    }
}
initDB();

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

// Status processing untuk tracking video HLS (khusus status asinkron, bukan URL-nya)
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
app.get('/api/pesan', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM history_pesan');
        res.status(200).json({ history: rows });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ message: "Gagal mengambil data riwayat pesan." });
    }
});

// Membuat endpoint POST /api/pesan untuk mengupdate pesan
app.post('/api/pesan', async (req, res) => {
    const { pesan } = req.body;
    if (pesan) {
        try {
            const waktu = new Date().toString();
            await pool.query('INSERT INTO history_pesan (pesan, waktu) VALUES (?, ?)', [pesan, waktu]);
            res.status(200).json({ status: "sukses", message: "Pesan berhasil disimpan ke database!" });
        } catch (err) {
            console.error("Database error:", err);
            res.status(500).json({ status: "gagal", message: "Gagal menyimpan pesan ke database." });
        }
    } else {
        res.status(400).json({ status: "gagal", message: "Pesan tidak boleh kosong." });
    }
});

// Endpoint untuk mendapatkan riwayat gambar
app.get('/api/gambar', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM history_gambar');
        res.status(200).json({ history: rows });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ message: "Gagal mengambil data riwayat gambar." });
    }
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
        
        // Simpan ke database
        const waktu = new Date().toString();
        await pool.query('INSERT INTO history_gambar (url, waktu) VALUES (?, ?)', [result.secure_url, waktu]);
        
        res.status(200).json({ status: "sukses", message: "Gambar berhasil ditambahkan ke database!" });
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
app.get('/api/video', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM history_video');
        res.status(200).json({ history: rows });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ message: "Gagal mengambil data riwayat video." });
    }
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
    }).then(async (result) => {
        console.log('Upload video Cloudinary selesai! HLS sedang di-generate di latar belakang Cloudinary.');
        
        // Kita menggunakan cloudinary.url() untuk merakit URL HLS (.m3u8) secara pasti
        const generatedUrl = cloudinary.url(result.public_id, { 
            resource_type: "video", 
            format: "m3u8", 
            streaming_profile: "hd", 
            secure: true 
        });
        
        try {
            // Simpan ke database
            const waktu = new Date().toString();
            await pool.query('INSERT INTO history_video (url, waktu) VALUES (?, ?)', [generatedUrl, waktu]);
            statusVideo = 'ready';
        } catch (dbErr) {
            console.error("Database error saving video url:", dbErr);
            statusVideo = 'error';
        }
        
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
