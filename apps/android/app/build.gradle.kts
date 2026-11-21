plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// ---------------------------------------------------------------------------
// Hybrid shell endpoints (Batch 0). Public configuration only — never secrets.
// Both values must be absolute HTTPS URLs and are overridable per build via
// gradle properties, e.g.:
//   ./gradlew :app:assembleDebug -PSTUDENT_WEB_BASE_URL=https://app.cms.example.com
// ---------------------------------------------------------------------------
fun requireHttpsUrl(name: String, value: String) {
    if (!value.startsWith("https://") || value.drop("https://".length).isBlank()) {
        throw GradleException("$name must be an absolute HTTPS URL (got: '$value')")
    }
    if ('"' in value || '\\' in value) {
        throw GradleException("$name must not contain quotes or backslashes")
    }
}

val studentWebBaseUrl = providers.gradleProperty("STUDENT_WEB_BASE_URL")
    .orElse("https://app.cms.example.com").get().trim()
    .also { requireHttpsUrl("STUDENT_WEB_BASE_URL", it) }
val apiBaseUrl = providers.gradleProperty("API_BASE_URL")
    .orElse("https://api.cms.example.com").get().trim()
    .also { requireHttpsUrl("API_BASE_URL", it) }

// Batch 2: optional HTTPS certificate pinning for the native offline clients.
// SPKI SHA-256 pins, comma-separated, each optionally prefixed with sha256/.
// EMPTY (default) = pinning disabled (debug builds against placeholder domains keep
// working); non-empty = enforced fail-closed. Pins are public hashes, never secrets.
fun requirePinList(name: String, value: String) {
    if (value.isEmpty()) return
    value.split(',').forEach { entry ->
        val normalized = entry.trim().removePrefix("sha256/")
        if (normalized.isEmpty() || normalized.any { it !in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=" }) {
            throw GradleException("$name entries must be base64 SPKI SHA-256 pins, optionally prefixed with sha256/ (got: '$entry')")
        }
    }
}
val apiSpkiPinsBase64 = providers.gradleProperty("OFFLINE_API_SPKI_PINS_BASE64")
    .orElse("").get().trim()
    .also { requirePinList("OFFLINE_API_SPKI_PINS_BASE64", it) }

android {
    namespace = "com.cms.student"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.cms.student"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Safe defaults: release pipeline may inject public configuration only; never a private key.
        buildConfigField("boolean", "OFFLINE_TRUSTED_CLIENT_IMPLEMENTED", "false")
        buildConfigField("String", "OFFLINE_API_BASE_URL", "\"\"")
        buildConfigField("String", "OFFLINE_MANIFEST_SIGNING_PUBLIC_KEY_SPKI_BASE64", "\"\"")
        buildConfigField("String", "OFFLINE_KEYSTORE_ALIAS", "\"cms.offline.package.key\"")
        // Hybrid WebView shell (Batch 0): HTTPS-only student web + API endpoints.
        // Defaults are the documented placeholder domains in deploy/; release or local
        // builds override them with -PSTUDENT_WEB_BASE_URL=... / -PAPI_BASE_URL=...
        buildConfigField("String", "STUDENT_WEB_BASE_URL", "\"$studentWebBaseUrl\"")
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        // Batch 2: optional SPKI SHA-256 pin set for the native offline clients (empty = off).
        buildConfigField("String", "OFFLINE_API_SPKI_PINS_BASE64", "\"$apiSpkiPinsBase64\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
    lint { abortOnError = true; warningsAsErrors = false }
    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("com.google.code.gson:gson:2.11.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:core:1.6.1")
}
