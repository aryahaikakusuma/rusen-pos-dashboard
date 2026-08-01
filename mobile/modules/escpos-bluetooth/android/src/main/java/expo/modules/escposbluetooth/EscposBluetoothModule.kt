package expo.modules.escposbluetooth

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.util.UUID

/**
 * Pengiriman byte ESC/POS ke printer termal lewat Bluetooth Classic (SPP).
 *
 * Modul lokal, bukan pustaka pihak ketiga. Alasannya bukan selera: printer
 * sudah dipasangkan lewat Pengaturan Android, jadi seluruh permukaan yang
 * membuat pustaka Bluetooth besar — memindai, memasangkan, mengelola ikatan,
 * berlangganan peristiwa koneksi — adalah pekerjaan yang tidak diperlukan di
 * sini. Yang tersisa hanya tiga hal: baca daftar perangkat terpasang, buka
 * soket RFCOMM, tulis byte. Satu-satunya pustaka SPP yang masih hidup
 * (react-native-bluetooth-classic) masih berstatus RC, isu "New Arch Support"
 * (#334) terbuka sejak 2024 tanpa implementasi, dan plugin Expo yang
 * didokumentasikannya terakhir terbit Mei 2022. Menumpang di sana berarti
 * menaruh jalur uang di atas lapisan interop yang justru sedang dibongkar
 * React Native.
 *
 * Ditulis dengan Expo Modules API, jadi ini TurboModule sungguhan dan tidak
 * bergantung pada lapisan interop itu sama sekali. Modul lokal ikut terbawa
 * prebuild dan build EAS tanpa perlu config plugin.
 *
 * Yang TIDAK ada di sini, dan sengaja: pemindaian, pemasangan, dan pemantauan
 * status koneksi. Kalau suatu saat printer harus dipasangkan dari dalam
 * aplikasi, itu penambahan sadar — bukan sesuatu yang seharusnya sudah ada.
 */
class EscposBluetoothModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("EscposBluetooth")

    /**
     * Keadaan Bluetooth sebagai data, bukan sebagai lemparan error. Layar
     * pemilih printer perlu membedakan "tidak ada perangkat keras",
     * "Bluetooth mati", dan "izin belum diberikan" supaya bisa mengatakan yang
     * benar kepada kasir — tiga keadaan itu punya tindakan perbaikan yang
     * berbeda.
     */
    AsyncFunction("getStatus") {
      val adapter = adapterOrNull()
      mapOf(
        "supported" to (adapter != null),
        "enabled" to (adapter?.isEnabled == true),
        "hasPermission" to hasConnectPermission()
      )
    }

    /**
     * Perangkat yang sudah dipasangkan lewat Pengaturan Android.
     *
     * Semuanya dikembalikan, bukan hanya yang terlihat seperti printer, dan
     * penyaringan diserahkan ke sisi JS lewat `supportsSpp`. Menyaring di sini
     * berarti sebuah printer yang tidak mengumumkan kelas perangkatnya dengan
     * rapi akan lenyap dari daftar tanpa satu pun pesan — dan kasir yang
     * printernya tidak muncul tidak punya cara menebak kenapa.
     */
    AsyncFunction("listBondedDevices") {
      val adapter = requireEnabledAdapter()

      @Suppress("MissingPermission")
      adapter.bondedDevices.orEmpty().map { device ->
        mapOf(
          "name" to (device.name ?: device.address),
          "address" to device.address,
          "supportsSpp" to device.supportsSpp(),
          "isImagingClass" to (device.bluetoothClass?.majorDeviceClass == IMAGING_MAJOR_CLASS)
        )
      }
    }

    /**
     * Kirim byte mentah ke satu perangkat, lalu tutup.
     *
     * Koneksi tidak disimpan antar cetakan. Sambungan RFCOMM yang dibiarkan
     * terbuka akan mati sendiri ketika printer dimatikan atau dibawa menjauh,
     * dan yang tersisa adalah soket yang tampak hidup tetapi menelan struk.
     * Membuka ulang setiap kali memakan waktu satu-dua detik dan menghapus
     * seluruh kelas kegagalan itu.
     *
     * AsyncFunction dijalankan Expo di luar thread JS, jadi connect() yang
     * memblokir tidak membekukan antarmuka.
     */
    AsyncFunction("printPackets") { address: String, packets: List<ByteArray> ->
      val adapter = requireEnabledAdapter()

      @Suppress("MissingPermission")
      val device = adapter.bondedDevices.orEmpty().firstOrNull { it.address == address }
        ?: throw NotBondedException(address)

      // Di sini dulu ada `if (adapter.isDiscovering) adapter.cancelDiscovery()`,
      // pengaman baku terhadap pemindaian yang mengganggu radio saat connect().
      // Pengaman itu justru satu-satunya yang gagal: `isDiscovering` sendiri
      // menuntut BLUETOOTH_SCAN, izin yang sengaja tidak diminta modul ini,
      // sehingga ia melempar SecurityException sebelum satu pun percobaan
      // menyambung dijalankan. Dibuang, bukan ditukar dengan izin baru —
      // aplikasi ini tidak pernah memulai pemindaian, jadi tidak pernah ada
      // yang perlu dibatalkan.

      var socket: BluetoothSocket? = null
      try {
        socket = connectAnyWay(device)

        val stream = socket.outputStream
        for ((index, packet) in packets.withIndex()) {
          // Satu paket ditulis UTUH, tanpa jeda di dalamnya. Paket adalah satuan
          // yang tidak boleh terpotong — sebuah perintah raster, misalnya —
          // karena printer ini membatalkan perintah yang belum lengkap begitu
          // alirannya berhenti sejenak, lalu kembali ke mode teks dan mencetak
          // sisa data gambar sebagai karakter. Yang menentukan batasnya adalah
          // penyusun struk, bukan berkas ini: di sini tidak ada yang tahu apa
          // itu ESC/POS.
          stream.write(packet)
          stream.flush()
          // Jeda hanya DI ANTARA paket, tempat printer memang sedang tidak
          // menunggu kelanjutan apa pun. Ini yang memberi buffernya waktu
          // kosong: RFCOMM punya kendali aliran, tetapi printer sekelas ini
          // tidak selalu memakainya — ketika penuh ia membuang byte tanpa
          // melapor, dan write() tetap berhasil.
          if (index < packets.size - 1) Thread.sleep(PACKET_PAUSE_MILLIS)
        }

        Thread.sleep(DRAIN_MILLIS)
      } catch (error: IOException) {
        // Pesan asli Android untuk kegagalan ini adalah "read failed, socket
        // might closed", yang tidak berarti apa-apa bagi kasir — jadi yang
        // dilihat kasir sudah diterjemahkan di sisi JS. Tetapi pesan itu satu-
        // satunya petunjuk yang berguna saat memperbaiki, dan sebelumnya ia
        // tertelan seluruhnya oleh CodedException. Sekarang masuk logcat.
        Log.e(TAG, "Gagal mencetak ke ${device.name ?: address}", error)
        throw PrintFailedException(device.name ?: address, error)
      } finally {
        try {
          socket?.close()
        } catch (_: IOException) {
          // Menutup soket yang sudah mati bukan kegagalan mencetak.
        }
      }
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw MissingContextException()

  private fun adapterOrNull(): BluetoothAdapter? =
    (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  /** Tiga syarat yang sama sebelum menyentuh radio, supaya tidak terulang. */
  private fun requireEnabledAdapter(): BluetoothAdapter {
    val adapter = adapterOrNull() ?: throw BluetoothUnsupportedException()
    if (!hasConnectPermission()) throw MissingPermissionException()
    if (!adapter.isEnabled) throw BluetoothOffException()
    return adapter
  }

  /**
   * Sebelum Android 12 izin Bluetooth diberikan saat pemasangan, jadi tidak ada
   * yang perlu diperiksa. Sejak API 31 ia jadi izin runtime, dan tanpa
   * permintaan runtime aplikasi hanya melihat daftar perangkat kosong — tanpa
   * error, tanpa petunjuk.
   */
  private fun hasConnectPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.BLUETOOTH_CONNECT
    ) == PackageManager.PERMISSION_GRANTED
  }
}

internal const val TAG = "EscposBluetooth"

/**
 * Sambungkan dengan cara apa pun yang mau bekerja.
 *
 * Satu cara saja tidak cukup, dan ini bukan pertahanan berlebihan — printer
 * termal murah memang begitu. `createRfcommSocketToServiceRecord` bergantung
 * pada penemuan layanan SDP: telepon bertanya "di kanal mana SPP kamu?", lalu
 * memakai jawabannya. Printer kelas ini kerap menjawab lambat, menjawab dari
 * cache yang basi, atau menolak soket aman karena tidak punya perangkat
 * enkripsi yang memadai. Yang terlihat di sisi Android hanyalah IOException
 * dengan pesan "read failed, socket might closed" — pesan yang sama untuk
 * empat sebab berbeda.
 *
 * Urutannya: SPP tanpa enkripsi, SPP aman, lalu langsung ke kanal RFCOMM 1
 * lewat refleksi dengan melewati SDP sepenuhnya. Kanal 1 adalah tempat printer
 * ESC/POS hampir selalu berada.
 *
 * KENAPA YANG TANPA ENKRIPSI DULU, padahal yang aman lebih "benar". Diukur di
 * perangkat, bukan dikira-kira:
 *
 *   08:19:46.525  Gagal lewat SPP aman: read failed, socket might closed
 *   08:19:51.098  Tersambung lewat SPP tanpa enkripsi
 *   08:19:51.702  Tersambung lewat SPP aman
 *
 * Percobaan aman yang gagal memblokir 4,57 detik sebelum menyerah — printer
 * belum menerima satu byte pun selama itu, dan kasir hanya melihat layar diam.
 * Perhatikan baris ketiga: 0,6 detik kemudian cara aman berhasil lagi. Jadi
 * kegagalannya tidak menetap, ia bergantung pada tautan yang sudah hangat atau
 * belum. Printer sekelas ini punya tumpukan Bluetooth minimal dengan kunci
 * tautan lemah, sehingga permintaan kanal terenkripsi memicu otentikasi ulang
 * yang sering tidak dijawab saat radio baru bangun. Cetakan pertama setelah
 * menganggur itulah yang membayar.
 *
 * Yang ditukar dengan 4,5 detik itu adalah enkripsi atas isi struk, sepanjang
 * satu meter, menuju printer yang sebentar lagi mencetaknya di atas kertas dan
 * menyerahkannya ke pelanggan. Tidak ada rahasia yang dijaga. Jadi yang tanpa
 * enkripsi didahulukan — bukan karena lebih baik, tapi karena yang dibayar
 * mahal di sini tidak melindungi apa pun.
 *
 * Catatan tentang asal-usul rangkaian ini, karena urutan kejadiannya
 * mengajarkan sesuatu. Ia ditambahkan atas dugaan bahwa RPP02N menolak soket
 * aman — dugaan yang saat itu KELIRU: sebab kegagalan sebenarnya adalah
 * SecurityException pada `isDiscovering` (lihat printBytes). Begitu baris itu
 * dibuang, RPP02N tersambung lewat cara aman pada percobaan pertama, dan
 * rangkaian ini sempat dicatat sebagai cabang mati yang belum pernah terbukti.
 * Setengah jam kemudian ia yang menyelamatkan sebuah cetakan. Diagnosisnya
 * salah, obatnya benar; keduanya layak diingat, karena atas hasil pertama saja
 * cabang ini sudah pantas dihapus sebagai kode mati.
 *
 * Setiap percobaan yang gagal ditutup sebelum yang berikutnya dimulai: soket
 * RFCOMM yang ditinggalkan terbuka menahan kanalnya, dan percobaan berikutnya
 * akan gagal karena percobaan sebelumnya, bukan karena printernya.
 *
 * Yang berhasil dicatat ke logcat, supaya urutan ini kelak bisa dipendekkan
 * berdasarkan kenyataan alih-alih dugaan.
 */
@Suppress("MissingPermission")
private fun connectAnyWay(device: BluetoothDevice): BluetoothSocket {
  val attempts: List<Pair<String, () -> BluetoothSocket>> = listOf(
    "SPP tanpa enkripsi" to { device.createInsecureRfcommSocketToServiceRecord(SPP_UUID) },
    "SPP aman" to { device.createRfcommSocketToServiceRecord(SPP_UUID) },
    "kanal 1 langsung" to {
      device.javaClass
        .getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
        .invoke(device, 1) as BluetoothSocket
    },
    "kanal 1 tanpa enkripsi" to {
      device.javaClass
        .getMethod("createInsecureRfcommSocket", Int::class.javaPrimitiveType)
        .invoke(device, 1) as BluetoothSocket
    }
  )

  var last: Exception? = null

  // Seluruh rangkaian dijalankan DUA putaran, dengan jeda di antaranya.
  //
  // Ini bukan pengulangan asal-asalan; ia menjawab kegagalan yang sudah terekam
  // di log dan dikutip pada komentar di atas: percobaan yang sama gagal, lalu
  // berhasil 0,6 detik kemudian. Radio printer yang baru bangun butuh satu
  // tautan yang gagal dulu sebelum yang berikutnya jalan. Tanpa putaran kedua,
  // kegagalan itu sampai ke kasir sebagai "printer tidak menjawab", dan yang
  // dilakukan kasir adalah membuka Pengaturan Bluetooth untuk menyambungkan
  // ulang dengan tangan — pekerjaan yang seharusnya tidak pernah ia sadari.
  //
  // Ongkos maksimalnya ditanggung hanya oleh cetakan yang memang akan gagal.
  for (round in 1..2) {
    for ((label, open) in attempts) {
      var socket: BluetoothSocket? = null
      try {
        socket = open()
        socket.connect()
        Log.i(TAG, "Tersambung ke ${device.name} lewat $label (putaran $round)")
        return socket
      } catch (error: Exception) {
        Log.w(TAG, "Gagal lewat $label (putaran $round): ${error.message}")
        last = error
        try {
          socket?.close()
        } catch (_: IOException) {
          // Soket yang gagal dibuka tidak selalu bisa ditutup. Bukan masalah.
        }
      }
    }
    if (round == 1) Thread.sleep(RETRY_PAUSE_MILLIS)
  }

  throw last as? IOException ?: IOException("Semua cara menyambung gagal", last)
}

/**
 * UUID baku Serial Port Profile. Angka inilah yang membuat modul ini berbicara
 * dengan printer termal murah: kelas printer ini tidak mengimplementasikan BLE
 * sama sekali, sehingga pustaka BLE mana pun — termasuk react-native-ble-plx
 * yang didukung Expo — tidak akan pernah menemukannya. RPP02N di meja memang
 * mengumumkan 00001101, terbaca lewat `adb shell dumpsys bluetooth_manager`.
 */
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

/**
 * Jeda antar paket, supaya printer sempat mengosongkan buffernya.
 *
 * Lebih panjang daripada jeda antar potongan yang dipakai sebelumnya, dan itu
 * justru karena jumlah jedanya jauh lebih sedikit: struk berlogo punya sekitar
 * sepuluh paket, bukan dua puluh potongan, sehingga seluruh ongkosnya di bawah
 * setengah detik. Struk tanpa logo hanya punya dua paket dan praktis tidak
 * membayar apa-apa.
 */
private const val PACKET_PAUSE_MILLIS = 40L

/**
 * Jeda sebelum putaran kedua percobaan menyambung. Cukup lama untuk membiarkan
 * radio printer selesai bangun, cukup singkat untuk tidak terasa sebagai
 * aplikasi yang menggantung.
 */
private const val RETRY_PAUSE_MILLIS = 700L

/**
 * Menutup soket tepat setelah write() memutus aliran sebelum printer selesai
 * menarik kertas: baris terakhir hilang. Jeda ini yang membuat struk keluar
 * utuh.
 */
private const val DRAIN_MILLIS = 400L

/** Kelas perangkat "imaging" — printer, pemindai, kamera. */
private const val IMAGING_MAJOR_CLASS = 0x0600

@Suppress("MissingPermission")
private fun BluetoothDevice.supportsSpp(): Boolean =
  uuids.orEmpty().any { it.uuid == SPP_UUID }

// Kode error dipakai apa adanya oleh sisi JS untuk memilih kalimat bahasa
// Indonesia, sama seperti kode error RPC di db/errors.ts. Pesan di sini untuk
// log; yang dibaca kasir disusun di sana.
internal class BluetoothUnsupportedException :
  CodedException("BLUETOOTH_UNSUPPORTED", "Perangkat ini tidak punya Bluetooth.", null)

internal class BluetoothOffException :
  CodedException("BLUETOOTH_OFF", "Bluetooth sedang mati.", null)

internal class MissingPermissionException :
  CodedException("BLUETOOTH_PERMISSION_DENIED", "Izin Bluetooth belum diberikan.", null)

internal class NotBondedException(address: String) :
  CodedException("PRINTER_NOT_BONDED", "Printer $address belum dipasangkan.", null)

internal class PrintFailedException(name: String, cause: Throwable) :
  CodedException("PRINT_FAILED", "Gagal mencetak ke $name.", cause)

internal class MissingContextException :
  CodedException("NO_CONTEXT", "Konteks Android tidak tersedia.", null)
