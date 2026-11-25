package com.cms.student.media

import java.io.BufferedOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.security.SecureRandom
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * W5b-ii (Phase Q playback) — the in-process reassembly channel for chunked
 * offline episodes. A tiny HTTP server bound to 127.0.0.1 ONLY: [VideoView]/
 * [MediaPlayer] stream `http://127.0.0.1:{port}/{token}/stream`, and this
 * server decrypts ONE 4 MiB chunk at a time from [ChunkedFileStore.readChunk]
 * into memory on demand, honoring HTTP Range so seeking works. No complete
 * clear media file is ever written to disk — the plaintext exists only as
 * transient in-memory chunk buffers inside this process.
 *
 * Containment (owner lock 5):
 *  - Binds loopback exclusively; on Android 127.0.0.1 is per-app-UID isolated,
 *    so no other app can reach it.
 *  - Every request must carry the random 128-bit token generated per server
 *    instance; any other path answers 404 and the connection is dropped.
 *  - The server lives exactly as long as the player activity that started it
 *    ([close] on destroy); no state, index, or bytes persist.
 *
 * HTTP surface (deliberately minimal): GET only, one path shape, `Range:
 * bytes=a-b` / `bytes=a-` / suffix `bytes=-n`, 200 or 206 with Content-Range,
 * `Accept-Ranges: bytes`, `Connection: close` per response.
 */
class ChunkedMediaLoopbackServer(
    private val episodeId: String,
    private val store: ChunkedFileStore,
    private val contentType: String
) {
    /** One satisfiable byte range. */
    data class ByteRange(val start: Long, val endInclusive: Long) {
        val length: Long get() = endInclusive - start + 1
    }

    private val started = AtomicBoolean(false)
    private val closed = AtomicBoolean(false)
    private val token: String = buildString {
        val random = ByteArray(16)
        SecureRandom().nextBytes(random)
        for (byte in random) append(String.format(Locale.US, "%02x", byte))
    }
    private var serverSocket: ServerSocket? = null
    private var acceptExecutor: ExecutorService? = null
    private var connectionExecutor: ExecutorService? = null

    /** The random per-instance URL token — never guessable by another component. */
    fun token(): String = token

    /** Starts the server; returns the bound loopback port, or null when it could not start. */
    @Synchronized
    fun start(): Int? {
        if (closed.get() || started.getAndSet(true)) return port()
        return runCatching {
            ServerSocket(0, BACKLOG, LOOPBACK).also { socket ->
                serverSocket = socket
                acceptExecutor = Executors.newSingleThreadExecutor().also { executor ->
                    executor.execute { acceptLoop(socket) }
                }
            }.localPort
        }.getOrNull()
    }

    /** The bound port, or null before [start]. */
    fun port(): Int? = serverSocket?.localPort

    /** The full stream URL a player should use: `http://127.0.0.1:{port}/{token}/stream`. */
    fun streamUrl(): String? = port()?.let { port -> "http://$LOOPBACK_HOST:$port/$token/stream" }

    /** Stops accepting, closes the socket, and lets in-flight connections drain. */
    @Synchronized
    fun close() {
        if (closed.getAndSet(true)) return
        runCatching { serverSocket?.close() }
        acceptExecutor?.shutdownNow()
        connectionExecutor?.shutdown()
        serverSocket = null
        acceptExecutor = null
        connectionExecutor = null
    }

    // =====================================================================
    // Request handling
    // =====================================================================

    private fun acceptLoop(socket: ServerSocket) {
        while (!closed.get()) {
            val client = runCatching { socket.accept() }.getOrNull() ?: return
            connectionExecutor().execute {
                runCatching { serve(client) }
            }
        }
    }

    private fun serve(client: Socket) {
        client.use { connection ->
            connection.soTimeout = SOCKET_TIMEOUT_MS
            val request = readRequest(connection.getInputStream()) ?: return
            val sink = BufferedOutputStream(connection.getOutputStream(), COPY_BUFFER_SIZE)
            if (request.method != "GET") {
                writeHead(sink, STATUS_METHOD_NOT_ALLOWED, emptyMap())
                sink.flush()
                return
            }
            if (request.path != "/$token/stream") {
                writeHead(sink, STATUS_NOT_FOUND, emptyMap())
                sink.flush()
                return
            }
            val total = store.totalBytes(episodeId)
            if (total <= 0L || store.chunkCount(episodeId) == 0) {
                writeHead(sink, STATUS_NOT_FOUND, emptyMap())
                sink.flush()
                return
            }
            store.touch(episodeId)
            when (val decision = RangeHeader.parse(request.headers["range"], total)) {
                is RangeHeader.Decision.Unsatisfiable -> {
                    writeHead(sink, STATUS_RANGE_NOT_SATISFIABLE, mapOf("Content-Range" to "bytes */$total"))
                    sink.flush()
                }
                is RangeHeader.Decision.None -> {
                    writeHead(sink, STATUS_OK, mapOf("Content-Length" to total.toString()))
                    writeBody(sink, 0L, total)
                    sink.flush()
                }
                is RangeHeader.Decision.Satisfiable -> {
                    val range = decision.range
                    writeHead(
                        sink,
                        STATUS_PARTIAL_CONTENT,
                        mapOf(
                            "Content-Range" to "bytes ${range.start}-${range.endInclusive}/$total",
                            "Content-Length" to range.length.toString()
                        )
                    )
                    writeBody(sink, range.start, range.length)
                    sink.flush()
                }
            }
        }
    }

    /** Streams [length] bytes starting at absolute [start], decrypting chunk by chunk. */
    private fun writeBody(sink: OutputStream, start: Long, length: Long) {
        var remaining = length
        var absolute = start
        val chunkSize = CachePolicy.MAX_AV_CHUNK_BYTES
        while (remaining > 0 && !closed.get()) {
            val chunkIndex = (absolute / chunkSize).toInt()
            val chunk = store.readChunk(episodeId, chunkIndex) ?: throw IOException("chunk $chunkIndex missing")
            val offsetInChunk = (absolute % chunkSize).toInt()
            val take = minOf(remaining, (chunk.size - offsetInChunk).toLong()).toInt()
            sink.write(chunk, offsetInChunk, take)
            absolute += take
            remaining -= take
        }
    }

    /** Writes the status line + base headers + [extra] headers + the blank line. */
    private fun writeHead(sink: OutputStream, status: Int, extra: Map<String, String>) {
        val reason = when (status) {
            STATUS_OK -> "OK"
            STATUS_PARTIAL_CONTENT -> "Partial Content"
            STATUS_NOT_FOUND -> "Not Found"
            STATUS_METHOD_NOT_ALLOWED -> "Method Not Allowed"
            STATUS_RANGE_NOT_SATISFIABLE -> "Range Not Satisfiable"
            else -> "Error"
        }
        val builder = StringBuilder("HTTP/1.1 $status $reason\r\n")
        builder.append("Content-Type: ").append(contentType).append("\r\n")
        builder.append("Accept-Ranges: bytes\r\n")
        for ((key, value) in extra) builder.append(key).append(": ").append(value).append("\r\n")
        builder.append("Connection: close\r\n\r\n")
        sink.write(builder.toString().toByteArray(Charsets.ISO_8859_1))
    }

    /** Minimal HTTP/1.1 request reader: request line + headers only (bodies are not used). */
    private fun readRequest(input: InputStream): HttpRequest? {
        val reader = input.bufferedReader(Charsets.ISO_8859_1)
        val requestLine = runCatching { reader.readLine() }.getOrNull() ?: return null
        val parts = requestLine.split(" ")
        if (parts.size < 2) return null
        val headers = mutableMapOf<String, String>()
        while (true) {
            val line = runCatching { reader.readLine() }.getOrNull() ?: break
            if (line.isEmpty()) break
            val colon = line.indexOf(':')
            if (colon <= 0) continue
            headers[line.substring(0, colon).trim().lowercase(Locale.US)] = line.substring(colon + 1).trim()
        }
        return HttpRequest(parts[0], parts[1], headers)
    }

    /** Per-instance connection pool (bounded small — one player, sequential range reads). */
    @Synchronized
    private fun connectionExecutor(): ExecutorService {
        var current = connectionExecutor
        if (current == null || current.isShutdown) {
            current = Executors.newFixedThreadPool(MAX_CONNECTIONS)
            connectionExecutor = current
        }
        return current
    }

    private data class HttpRequest(val method: String, val path: String, val headers: Map<String, String>)

    companion object {
        private const val LOOPBACK_HOST = "127.0.0.1"
        private val LOOPBACK = java.net.InetAddress.getByName(LOOPBACK_HOST)
        private const val BACKLOG = 8
        private const val MAX_CONNECTIONS = 4
        private const val SOCKET_TIMEOUT_MS = 30_000
        private const val COPY_BUFFER_SIZE = 64 * 1024

        const val STATUS_OK = 200
        const val STATUS_PARTIAL_CONTENT = 206
        const val STATUS_NOT_FOUND = 404
        const val STATUS_METHOD_NOT_ALLOWED = 405
        const val STATUS_RANGE_NOT_SATISFIABLE = 416
    }
}

/**
 * Pure Range-header parsing — separated from the server so the JVM tests lock
 * the byte math without sockets.
 */
object RangeHeader {

    /** [parse]'s full decision tree. */
    sealed interface Decision {
        /** No usable Range header — serve 200 whole-body. */
        object None : Decision

        /** Present but unsatisfiable — serve 416 with the extent. */
        object Unsatisfiable : Decision

        /** One satisfiable range — serve 206. */
        data class Satisfiable(val range: ChunkedMediaLoopbackServer.ByteRange) : Decision
    }

    /**
     * Parses `bytes=start-end`, `bytes=start-`, and `bytes=-suffix` against
     * [totalBytes]. Blank/null/malformed headers answer [Decision.None] (the
     * caller serves the whole body — a malformed range never fails playback);
     * a start beyond the end answers [Decision.Unsatisfiable].
     */
    fun parse(header: String?, totalBytes: Long): Decision {
        if (header.isNullOrBlank() || totalBytes <= 0) return Decision.None
        val value = header.trim()
        if (!value.lowercase(Locale.US).startsWith("bytes=")) return Decision.None
        val spec = value.substringAfter('=').trim()
        val dash = spec.indexOf('-')
        if (dash < 0) return Decision.None
        val startText = spec.substring(0, dash).trim()
        val endText = spec.substring(dash + 1).trim()

        if (startText.isEmpty()) {
            // Suffix form: the last N bytes (the whole body when N >= total).
            val suffix = endText.toLongOrNull() ?: return Decision.None
            if (suffix <= 0) return Decision.Unsatisfiable
            val length = minOf(suffix, totalBytes)
            return Decision.Satisfiable(ChunkedMediaLoopbackServer.ByteRange(totalBytes - length, totalBytes - 1))
        }
        val start = startText.toLongOrNull() ?: return Decision.None
        if (start < 0) return Decision.None
        if (start >= totalBytes) return Decision.Unsatisfiable
        val end = when {
            endText.isEmpty() -> totalBytes - 1
            else -> endText.toLongOrNull() ?: return Decision.None
        }
        val clampedEnd = end.coerceIn(start, totalBytes - 1)
        return Decision.Satisfiable(ChunkedMediaLoopbackServer.ByteRange(start, clampedEnd))
    }
}
