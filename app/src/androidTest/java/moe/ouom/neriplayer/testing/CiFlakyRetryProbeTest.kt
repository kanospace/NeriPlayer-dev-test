package moe.ouom.neriplayer.testing

import android.os.ParcelFileDescriptor
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith

// 仅用于测试仓库验证 CI 隔离重试：每台模拟器上首次运行失败，重试时通过
@RunWith(AndroidJUnit4::class)
class CiFlakyRetryProbeTest {
    @Test
    fun failsOnlyOnFirstAttemptPerEmulator() {
        val marker = "/data/local/tmp/neriplayer-ci-flaky-probe"
        if (!shell("ls $marker").contains(marker)) {
            shell("touch $marker")
            fail("CI flaky retry probe fails on its first attempt by design")
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
