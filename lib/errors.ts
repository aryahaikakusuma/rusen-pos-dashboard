/**
 * Kesalahan yang disebabkan oleh masukan pemanggil, bukan oleh server.
 *
 * Dipisah jadi kelas tersendiri supaya `jaga()` bisa membedakannya lewat
 * `instanceof`, bukan lewat mencocokkan awalan pesan. Pencocokan teks akan
 * diam-diam berhenti bekerja begitu ada yang memperbaiki ejaan sebuah pesan,
 * dan akibatnya kesalahan pengetikan pengguna dilaporkan sebagai 500.
 *
 * Isi pesannya BOLEH ditampilkan apa adanya ke pengguna. Kesalahan lain tidak.
 */
export class KesalahanMasukan extends Error {}
