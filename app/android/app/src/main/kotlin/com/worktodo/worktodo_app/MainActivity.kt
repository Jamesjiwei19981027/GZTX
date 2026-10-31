package com.worktodo.worktodo_app

import io.flutter.embedding.android.FlutterActivity
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var microphoneResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "worktodo/microphone")
            .setMethodCallHandler { call, result ->
                if (call.method != "requestPermission") {
                    result.notImplemented()
                } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    result.success(true)
                } else if (microphoneResult != null) {
                    result.success(false)
                } else {
                    microphoneResult = result
                    requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 8127)
                }
            }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 8127) {
            microphoneResult?.success(grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)
            microphoneResult = null
        }
    }

    override fun onDestroy() {
        microphoneResult?.success(false)
        microphoneResult = null
        super.onDestroy()
    }
}
