# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Building and installing

Managed workflow with a custom dev client, plus one **local native module**
(`modules/escpos-bluetooth`, Kotlin, Expo Modules API — a real TurboModule). Touching that
module means a native rebuild; JS-only changes do not.

```
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"   # JDK 21; system default is JRE 8
cd mobile/android && ./gradlew.bat assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

`JAVA_HOME` does not persist between shells — set it every time. `ANDROID_HOME` is covered by
`android/local.properties` (gitignored, as is all of `android/`).

`expo-updates` is enabled and `checkOnLaunch` is at its default, `ALWAYS` — it is not written
in `app.json`, so do not go looking for it. A reinstall keeps app data, so a cached
OTA bundle can outrank the bundle you just built. When behaviour looks stale, verify the running
code rather than assuming — see the APK-grep recipe in the root `AGENTS.md`.

# Before asking for a device

- `npm run typecheck`
- `npm run periksa:varian` — variant grouping over `../supabase/seed.sql`
- `npm run preview:struk` — receipt as text, proves 32-column fit

`screens/DebugScreen.tsx` runs the same assertions on-device against the live catalog.

# Local-first, and it matters

SQLite (`expo-sqlite`) is the source of truth while the shop is open; `db/push.ts` is a send
queue, deliberately **not** a sync engine — no background watcher, no pull, no conflict
resolution. `push_order` is idempotent on `orders.id`, and that id is generated on the device,
which is the whole reason "Kirim ulang" is safe to hand to a cashier.

Failures are recorded in `orders.sync_error`. Show it. It sat unread for a while and the cashier
saw only "check your connection" for causes that had nothing to do with the connection and would
never improve by retrying.

# OTA (`eas update`) — jalur rilis yang diutamakan

Sebelum menyentuh perintahnya, jawab dulu satu pertanyaan: **perubahannya JS saja, atau
menyentuh native?** Salah menjawab tidak menghasilkan error — ia menghasilkan splash yang
menggantung di tangan kasir.

Menyentuh native berarti: menambah/menghapus paket yang punya kode native, mengubah
`modules/escpos-bluetooth`, atau mengubah bagian `plugins`/permission/ikon di `app.json`.
Kalau salah satunya terjadi, OTA **tidak boleh** dipakai: naikkan `runtimeVersion` di
`app.json`, bangun APK, pasang manual ke semua perangkat. Menaikkan runtime itu justru
pengamannya — ponsel yang masih memakai APK lama jadi tidak menerima apa pun, bukan menerima
bundel yang memanggil modul yang tidak ada padanya. Ini sudah terjadi sekali: `expo-router`
menarik `react-native-screens`, dan OTA ke runtime lama akan mengirim JS yang butuh modul
native ke ponsel yang belum punya. Runtime naik dari `2` ke `3` karena itu.

APK di sini dibangun lokal lewat Gradle, bukan lewat EAS. Biasanya itu berarti APK-nya tidak
punya channel dan tidak akan pernah menerima OTA sama sekali. Yang membuatnya tetap bekerja
adalah `updates.requestHeaders: { "expo-channel-name": "production" }` di `app.json` — channel
ikut tertanam dari sana. **Jangan hapus baris itu**, dan jangan mengira ia mubazir karena
`eas.json` sudah menyebut channel yang sama; yang di `eas.json` hanya berlaku untuk build EAS.

Cara pakai sehari-hari untuk perubahan JS saja:

  cd mobile
  npx eas-cli@latest update --branch production --environment production --platform android -m
  "pesan singkat"

`--environment production` membaca variabel dari lingkungan **production di EAS**, bukan dari
`mobile/.env`. Kalau lingkungan itu kosong, `EXPO_PUBLIC_SUPABASE_URL` jadi `undefined` saat
bundling, `lib/env.ts` melempar sebelum React sempat merender, dan yang terlihat di ponsel hanya
splash yang menggantung — tanpa layar merah, tanpa pesan. Ini sudah pernah sampai ke perangkat;
`expo-updates` sendiri yang menyelamatkannya dengan menandai update itu gagal dan kembali ke
bundel lama pada peluncuran berikutnya.

Jadi periksa dulu, tiap kali ada variabel baru:

  npx eas-cli@latest env:list --environment production

Hanya `EXPO_PUBLIC_*` yang boleh ada di sana, dan visibility-nya harus `plaintext` — kunci yang
ditandai `sensitive` tidak terbaca saat bundling, dan kita kembali ke kegagalan yang sama.
`service_role` tidak pernah masuk ke sini.

Setelah publish, buktikan bundelnya sebelum menyentuh ponsel — `dist/` tertinggal dari ekspor:

  grep -c "<host Supabase>" dist/_expo/static/js/android/index-*.hbc

**Cari string ASCII saja.** Hermes menyimpan string non-ASCII sebagai UTF-16LE di tabel terpisah,
jadi tidak ada satu pun byte UTF-8 `·` di seluruh bundel — `grep " item · "` mengembalikan 0
untuk teks yang jelas-jelas ada di sana, dan itu terbaca seperti publish yang gagal. Kalau
stringnya memang harus mengandung karakter non-ASCII, cari sebagai UTF-16LE:

  python -c "d=open(r'dist/.../index-xxx.hbc','rb').read(); print(d.count(' item · '.encode('utf-16-le')))"

Selain host, cari juga `undefined/rest` — nol adalah yang benar. Kalau ia muncul, artinya
`EXPO_PUBLIC_SUPABASE_URL` tidak terbaca saat bundling dan bundel ini akan menggantung.
Menghitung string milik layar yang baru diubah juga murah dan sering menangkap sisa komponen
lama yang belum terhapus: dua kali berarti yang lama masih ikut terbundel.

Terakhir, **update tidak dipakai pada peluncuran yang sedang berjalan.** `checkOnLaunch` ada di
default `ALWAYS`: peluncuran pertama mengunduh di latar belakang dan masih memakai bundel lama,
peluncuran kedua baru memakainya. Jadi aplikasi yang tidak pernah ditutup tidak akan pernah
berubah — untuk perubahan penting, minta kasir menutup dan membuka aplikasi dua kali. Kalau
sebuah update rusak, `expo-updates` menandainya gagal dan kembali ke bundel sebelumnya pada
peluncuran berikutnya; itu jaring pengaman, bukan alasan untuk melewatkan pemeriksaan di atas.

Publish yang berhasil mencetak `Runtime version` — cocokkan dengan `runtimeVersion` di
`app.json` sebelum menganggapnya selesai. Rilis pertama lewat jalur ini adalah update group
`751586f6-7d7c-4718-928f-5899078f1763` di runtime 3, commit `2b92cdf`.
