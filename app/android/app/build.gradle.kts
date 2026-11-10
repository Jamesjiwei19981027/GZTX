import java.util.Properties
import java.util.Base64

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val signingProperties = Properties()
// flutter --dart-define 统一传给 Dart 与 Android 清单，空值可构建且不初始化 SDK。
val jpushDefines = (project.findProperty("dart-defines") as? String).orEmpty()
    .split(",").filter { it.isNotBlank() }.mapNotNull {
        runCatching { String(Base64.getDecoder().decode(it), Charsets.UTF_8).split("=", limit = 2) }
            .getOrNull()?.takeIf { parts -> parts.size == 2 }?.let { parts -> parts[0] to parts[1] }
    }.toMap()
val signingPropertiesFile = rootProject.file("key.properties")
if (signingPropertiesFile.exists()) {
    signingPropertiesFile.inputStream().use { signingProperties.load(it) }
}
val releaseSigningConfigured = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
    .all { signingProperties.getProperty(it).orEmpty().isNotBlank() }
val releaseSigningRequired = project.findProperty("releaseSigningRequired")?.toString() == "true" ||
    System.getenv("RELEASE_SIGNING_REQUIRED") == "true"
if (releaseSigningRequired && !releaseSigningConfigured) {
    throw GradleException("Release signing is required. Provide app/android/key.properties or set releaseSigningRequired=false for local builds.")
}

android {
    namespace = "com.worktodo.worktodo_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.worktodo.worktodo_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["JPUSH_PKGNAME"] = "com.worktodo.worktodo_app"
        manifestPlaceholders["JPUSH_APPKEY"] = jpushDefines["JPUSH_APPKEY"].orEmpty()
        manifestPlaceholders["JPUSH_CHANNEL"] = "developer-default"
        // 厂商通道预留（账号/应用审核后再添加真实值及对应 SDK 依赖）：
        // 小米：XIAOMI_APPID / XIAOMI_APPKEY
        // 华为：HUAWEI_APPID + 厂商控制台下载的 agconnect-services.json
        // OPPO：OPPO_APPKEY / OPPO_APPID / OPPO_APPSECRET
        // vivo：VIVO_APPKEY / VIVO_APPID；荣耀：HONOR_APPID
        // 参考 https://docs.jiguang.cn/jpush/client/Android/android_3rd_param
    }

    buildTypes {
        release {
            // Local builds retain debug signing; production CI must set
            // RELEASE_SIGNING_REQUIRED=true and provide android/key.properties.
            if (releaseSigningConfigured) {
                signingConfigs.create("release") {
                    storeFile = file(signingProperties.getProperty("storeFile"))
                    storePassword = signingProperties.getProperty("storePassword")
                    keyAlias = signingProperties.getProperty("keyAlias")
                    keyPassword = signingProperties.getProperty("keyPassword")
                }
                signingConfig = signingConfigs.getByName("release")
            } else {
                signingConfig = signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
