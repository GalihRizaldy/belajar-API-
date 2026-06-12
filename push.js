const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Dapatkan versi saat ini (misal: "1.1.01")
let version = pkg.version || "1.1.01";
let parts = version.split('.');

// Jika format tidak sesuai, reset ke 1.1.01
if (parts.length !== 3) parts = ['1', '1', '01'];

// Ekstrak angka terakhir
let lastPart = parseInt(parts[2], 10);
if (isNaN(lastPart)) lastPart = 0;

// Tambah 1
lastPart++;

// Format agar jika di bawah 10, ada angka 0 di depannya (contoh: 02, 03)
parts[2] = lastPart < 10 ? '0' + lastPart : lastPart.toString();

// Update JSON
pkg.version = parts.join('.');
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

console.log(`✅ Versi telah dinaikkan menjadi: v${pkg.version}`);

try {
    // Jalankan Git Commands
    console.log('🔄 Melakukan git add, commit, dan push...');
    execSync('git add .', { stdio: 'inherit' });
    execSync(`git commit -m "build: auto-bump version to v${pkg.version}"`, { stdio: 'inherit' });
    execSync('git push', { stdio: 'inherit' });
    console.log('🚀 Berhasil push ke GitHub dengan versi terbaru!');
} catch (error) {
    console.error('❌ Terjadi kesalahan saat menjalankan git. Pastikan tidak ada konflik.');
}
