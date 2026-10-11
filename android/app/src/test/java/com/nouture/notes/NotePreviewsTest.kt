package com.nouture.notes

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotePreviewsTest {
    private val base = listOf("* Tasks", "** TODO a", "** TODO b", "** TODO c", "")

    @Test
    fun unchangedHasNoRegion() {
        assertNull(NotePreviews.changedRegion(base, base))
    }

    @Test
    fun findsAChangedLine() {
        val new = base.toMutableList().apply { this[2] = "** DONE b" }
        assertEquals(2..2, NotePreviews.changedRegion(base, new))
    }

    @Test
    fun spansSeveralChanges() {
        val new = base.toMutableList().apply {
            this[1] = "** DONE a"
            this[3] = "** DONE c"
        }
        assertEquals(1..3, NotePreviews.changedRegion(base, new))
    }

    @Test
    fun coversInsertedLines() {
        val new = base.toMutableList().apply { addAll(3, listOf("*** new", "- item")) }
        assertEquals(3..4, NotePreviews.changedRegion(base, new))
    }

    @Test
    fun appendedAtTheEnd() {
        val new = base.dropLast(1) + listOf("** TODO d", "")
        assertEquals(4..4, NotePreviews.changedRegion(base, new))
    }

    @Test
    fun frontPagePutsPinnedFirstAndLeavesHiddenOut() {
        val recent = listOf("/a.org", "/b.org", "/c.org", "/d.org")
        assertEquals(
            listOf("/c.org", "/a.org", "/d.org"),
            NotePreviews.frontPage(recent, hidden = setOf("/b.org"), pinned = listOf("/c.org", "/gone.org")),
        )
        // Hidden wins over pinned
        assertEquals(listOf("/a.org"), NotePreviews.frontPage(listOf("/a.org", "/b.org"), setOf("/b.org"), listOf("/b.org")))
    }

    @Test
    fun deletionPointsAtTheFollowingLine() {
        val new = base.toMutableList().apply { removeAt(2) }
        assertEquals(2..2, NotePreviews.changedRegion(base, new))
    }
}
