# NexusMind

## Menjalankan lokal

1. Siapkan MySQL dan database `nexusmind`.
2. Salin `backend/.env.example` menjadi `.env` sesuai lingkungan.
3. Jalankan backend:

```bash
cd backend
go run .
```

4. Salin `frontend/.env.example` menjadi `.env` bila endpoint API berbeda.
5. Jalankan frontend:

```bash
cd frontend
npm install
npm run dev
```

## Endpoint kesiapan rilis

- `GET /api/health` untuk status API dan koneksi database.
- `GET /api/public/overview` untuk ringkasan publik landing/login.

## Rilis dengan Docker Compose

1. Salin `.env.example` menjadi `.env` di root proyek.
2. Isi `DB_PASS`, `MYSQL_ROOT_PASSWORD`, `SECRET_KEY`, dan `CORS_ALLOWED_ORIGINS` dengan nilai produksi. Gunakan domain frontend pada `APP_PUBLIC_URL` dan `CORS_ALLOWED_ORIGINS`.
3. Jika ingin membuat akun awal, isi variabel `BOOTSTRAP_DPA_*`, `BOOTSTRAP_KAPRODI_*`, dan `BOOTSTRAP_STAFF_*`. Password tidak dibuat otomatis oleh aplikasi.
4. Jalankan:

```bash
docker compose up -d --build
```

Program studi resmi akan dibuat otomatis: Teknik Informatika, Rekayasa Perangkat Lunak, Teknik Industri, Teknik Mesin, Manajemen, Ilmu Komunikasi, dan Hukum. Pendaftaran publik hanya membuat akun mahasiswa; penetapan DPA dilakukan oleh Kaprodi/admin melalui Manajemen User.

### Data demo presentasi

Seeder demo bersifat opt-in dan idempoten. Untuk membuat data presentasi Teknik Informatika, tambahkan sementara pada `.env`:

```env
SEED_DEMO_DATA=true
DEMO_PASSWORD=Presentasi2026!
```

Saat backend start, sistem membuat akun Kaprodi, staf, 12 mahasiswa, serta data asesmen, prediksi, happiness, curhat, bimbingan, laporan UTS/UAS, chat, slot DPA, rating, dan notifikasi. Enam mahasiswa semester 8 dipetakan ke Pak Iskandar, enam mahasiswa semester 6 ke Pak Ashari. Setelah seed berhasil, ubah `SEED_DEMO_DATA=false` dan simpan password demo hanya untuk kebutuhan presentasi.

## Akun demo presentasi

Password semua akun demo: `Presentasi2026!`. Login dapat memakai username atau email.

| Peran | Nama | Username | Email | Program studi | Semester | DPA |
| --- | --- | --- | --- | --- | ---: | --- |
| Kaprodi | Kaprodi Teknik Informatika | `kaprodi.ti` | `kaprodi.ti@umci.demo` | Teknik Informatika | - | - |
| DPA | Pak Iskandar | `iskandar.ti` | `iskandar.ti@umci.demo` | Teknik Informatika | - | - |
| DPA | Pak Ashari | `ashari.ti` | `ashari.ti@umci.demo` | Teknik Informatika | - | - |
| Staf | Staf Akademik Demo | `staff.demo` | `staff.demo@umci.demo` | Global | - | - |
| Mahasiswa | Andi Pratama | `ti20230001` | `ti20230001@umci.demo` | Teknik Informatika | 8 | Pak Iskandar |
| Mahasiswa | Siti Aulia | `ti20230002` | `ti20230002@umci.demo` | Teknik Informatika | 8 | Pak Iskandar |
| Mahasiswa | Bima Saputra | `ti20230003` | `ti20230003@umci.demo` | Teknik Informatika | 8 | Pak Iskandar |
| Mahasiswa | Citra Lestari | `ti20230004` | `ti20230004@umci.demo` | Teknik Informatika | 8 | Pak Iskandar |
| Mahasiswa | Dimas Nugraha | `ti20230005` | `ti20230005@umci.demo` | Teknik Informatika | 8 | Pak Iskandar |
| Mahasiswa | Nabila Rahma | `ti20230006` | `ti20230006@umci.demo` | Teknik Informatika | 8 | Pak Iskandar |
| Mahasiswa | Fajar Hidayat | `ti20240001` | `ti20240001@umci.demo` | Teknik Informatika | 6 | Pak Ashari |
| Mahasiswa | Nadia Safitri | `ti20240002` | `ti20240002@umci.demo` | Teknik Informatika | 6 | Pak Ashari |
| Mahasiswa | Reza Firmansyah | `ti20240003` | `ti20240003@umci.demo` | Teknik Informatika | 6 | Pak Ashari |
| Mahasiswa | Intan Maharani | `ti20240004` | `ti20240004@umci.demo` | Teknik Informatika | 6 | Pak Ashari |
| Mahasiswa | Galih Ramadhan | `ti20240005` | `ti20240005@umci.demo` | Teknik Informatika | 6 | Pak Ashari |
| Mahasiswa | Putri Amalia | `ti20240006` | `ti20240006@umci.demo` | Teknik Informatika | 6 | Pak Ashari |

Data demo mencakup asesmen, prediksi, happiness, daily check-in, curhat, MBTI, terapi, notifikasi, sesi bimbingan, laporan UTS/UAS, chat DPA, slot konsultasi, rating, dan tindak lanjut Kaprodi.

### Memulihkan database demo

`nexusmind-demo.sql` adalah dump schema lengkap dengan data presentasi yang sudah disanitasi. Dump ini hanya menyertakan akun demo dan relasi data demo, bukan data pengguna lama atau kredensial koneksi database.

```bash
mysql -u <DB_USER> -p <DB_NAME> < nexusmind-demo.sql
```

Untuk Docker Compose, isi variabel database di `.env` terlebih dahulu, lalu jalankan `docker compose up -d --build`.

## Catatan model

- Prediksi baru memakai `Quantum ridge regression` jika jumlah sampel memadai.
- Jika data belum cukup, sistem memakai `Psychometric fallback`.
- Fitur quantum yang disimpan: interference, order effect, cognitive dissonance, dan NLP stress.
