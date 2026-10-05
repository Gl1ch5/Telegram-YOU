plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Optional release signing: CI passes these as environment variables when the
// ANDROID_KEYSTORE_* secrets exist. Without them only the debug APK is built.
val releaseStoreFile: String? = System.getenv("TY_KEYSTORE_FILE")?.takeIf { it.isNotBlank() }

android {
    namespace = "io.github.gl1ch5.telegramyou"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.gl1ch5.telegramyou"
        minSdk = 24
        targetSdk = 35
        versionCode = (System.getenv("TY_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("TY_VERSION_NAME") ?: "1.0.0"
    }

    signingConfigs {
        // Fixed, public debug key (password "android") so every nightly debug APK
        // has the same signature and installs as an update, keeping the session.
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        if (releaseStoreFile != null) {
            create("release") {
                storeFile = file(releaseStoreFile)
                storePassword = System.getenv("TY_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("TY_KEY_ALIAS")
                keyPassword = System.getenv("TY_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (releaseStoreFile != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// The whole web app is packed into the APK (assets/), so the interface opens instantly and offline.
val webOut = layout.buildDirectory.dir("generated/web")
val copyWeb by tasks.registering(Copy::class) {
    from(rootProject.projectDir.resolve("../..")) {
        include("index.html", "manifest.webmanifest", "precache.json", "sw.js", "css/**", "js/**", "icons/**", "wallpapers/**", "fonts/**")
    }
    into(webOut)
}
android.sourceSets.getByName("main").assets.srcDir(webOut)
tasks.configureEach { if (name.startsWith("merge") && name.endsWith("Assets")) dependsOn(copyWeb) }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
}
