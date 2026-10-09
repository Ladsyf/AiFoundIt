package expo.modules.aifounditnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScanRulesTest {
  private val defaults = listOf("Android/data", "Android/obb")

  @Test
  fun appPrivateFoldersAreSkippedButAndroidMediaIsNot() {
    assertTrue(ScanRules.isExcluded("Android/data/com.example/files", defaults))
    assertTrue(ScanRules.isExcluded("android/obb", defaults))
    assertFalse(ScanRules.isExcluded("Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images", defaults))
  }

  @Test
  fun aPlainNameSkipsThatFolderAtAnyDepth() {
    assertTrue(ScanRules.isExcluded("Android/media/foo", listOf("Android")))
    assertTrue(ScanRules.isExcluded("Documents/Private", listOf("private")))
    assertTrue(ScanRules.isExcluded("WhatsApp/.Statuses", listOf(".Statuses")))
  }

  @Test
  fun aNameMatchesWholeFolderNamesOnly() {
    assertFalse(ScanRules.isExcluded("Documents/Privately", listOf("Private")))
    assertFalse(ScanRules.isExcluded("Documents/My Android notes", listOf("Android")))
  }

  @Test
  fun aPathSkipsThatFolderAndWhatIsUnderIt() {
    val rule = listOf("Documents/Private")
    assertTrue(ScanRules.isExcluded("Documents/Private", rule))
    assertTrue(ScanRules.isExcluded("documents/private/2024", rule))
    assertFalse(ScanRules.isExcluded("Download/Documents/Private", rule))
    assertFalse(ScanRules.isExcluded("Documents/PrivateStuff", rule))
  }

  @Test
  fun blankRulesNeverSkipEverything() {
    assertFalse(ScanRules.isExcluded("DCIM/Camera", listOf("", "  ", "/")))
  }

  @Test
  fun windowsStyleSeparatorsAndEdgeSlashesAreTolerated() {
    assertTrue(ScanRules.isExcluded("Documents/Private", listOf("~Documents~Private~".replace("~", Char(92).toString()))))
  }

  @Test
  fun priorityFollowsTheOrderOfTheRoots() {
    val roots = listOf("DCIM/Camera", "Download", "Documents")
    assertEquals(0, ScanRules.priority("/DCIM/Camera", roots))
    assertEquals(1, ScanRules.priority("Download/Receipts", roots))
    assertEquals(2, ScanRules.priority("Documents", roots))
    assertEquals(Int.MAX_VALUE, ScanRules.priority("Movies", roots))
  }

  @Test
  fun isUnderMeansTheRootItselfOrAnythingBelowIt() {
    val roots = listOf("Download")
    assertTrue(ScanRules.isUnder("Download", roots))
    assertTrue(ScanRules.isUnder("Download/x/y", roots))
    assertFalse(ScanRules.isUnder("Downloads", roots))
  }
}
