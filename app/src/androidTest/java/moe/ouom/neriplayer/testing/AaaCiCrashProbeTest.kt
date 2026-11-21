package moe.ouom.neriplayer.testing

import android.os.ParcelFileDescriptor
import android.os.Process
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.runner.RunWith

// 仅用于测试仓库验证插桩崩溃截断：每台模拟器上首次运行杀死插桩进程，同分片后续用例不再执行
@RunWith(AndroidJUnit4::class)
class AaaCiCrashProbeTest {
    @Test
    fun crashesInstrumentationOnFirstAttempt() {
        val marker = "/data/local/tmp/neriplayer-ci-crash-probe"
        if (!shell("ls $marker").contains(marker)) {
            shell("touch $marker")
            Process.killProcess(Process.myPid())
        }
    }

    private fun shell(command: String): String =
        InstrumentationRegistry.getInstrumentation().uiAutomation
            .executeShellCommand(command)
            .use { descriptor ->
                ParcelFileDescriptor.AutoCloseInputStream(descriptor)
                    .bufferedReader()
                    .use { it.readText() }
            }
}
