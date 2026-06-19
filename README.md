# SideNote

SideNote is a plugin for [Obsidian](https://obsidian.md) that allows you to add comments to your notes. These comments are displayed in a dedicated side pane, making it easy to review and navigate annotations without cluttering the main text. Comments are highlighted directly in the editor for quick visual reference.

## Features

### Core Features

- **Add Comment to Selection**: Easily add comments to selected text within your Markdown notes.
- **Note Comments**: Add a comment to an entire note without selecting any text — right-click in the editor with nothing selected or use the command palette ("Add note comment").
- **Dual View Modes**:
  - **Sidebar Mode**: Open comments in the right sidebar for persistent viewing
  - **Split View Mode**: Open comments in a split pane beside your note
- **Visual Highlights**: Commented text is automatically highlighted in the editor with a configurable style (default: yellow background with underline)
- **Auto-Tracking**: Comments automatically follow their text as you edit your notes using hash-based matching
- **Click to Navigate**:
  - Click any comment in the side pane to jump to its location in the editor
  - Double-click any comment to open the edit modal directly
  - Click any highlighted text in the editor to open the sidebar and highlight the corresponding comment
- **Internal Link Support**: `[[WikiLinks]]` inside comment text are fully clickable and open the linked note
- **Search Filter**: Filter comments in real time by typing in the search bar at the top of the sidebar (matches highlighted text and comment body; works in both Current File and All Notes views)
- **Inline Editing**: Add and edit comments directly in the sidebar via an inline textarea — no popup modal. `Cmd/Ctrl + Enter` saves, `Esc` cancels.
- **Edit and Delete**: Manage your comments directly from the side pane
- **Flexible Sorting**: Sort comments by their position in the file or by their creation timestamp
- **Orphaned Comment Management**: When the original text is deleted, comments are marked as "orphaned" and can be managed separately

### Advanced Features

- **Operational Transformation Tracking**: Comment positions are stored as absolute character offsets and transformed through every document edit via CodeMirror 6's `ChangeSet.mapPos()`. No text search is performed during editing; highlights follow their exact text in real time.
- **Accurate Duplicate Handling**: When the same string appears in multiple places, each comment tracks its own specific instance. The highlight never drifts to an unrelated occurrence, even when the original text is deleted.
- **Instant Orphan Detection**: When the commented text is deleted, the range collapses immediately and a red marker appears — without the highlight moving elsewhere. The red dot continues to follow subsequent edits via OT.
- **Undo Recovery**: Pressing Ctrl+Z to restore deleted text automatically recovers the comment in real time — no file save required.
- **Cross-Session Offset Persistence**: Absolute character offsets (`startOffset`/`endOffset`) are persisted per-comment so the correct position is restored without a re-search when Obsidian is restarted.
- **Active File Auto-Update**: When using sidebar mode, the comment view automatically updates as you switch between files
- **Orphaned Comment Highlighting**: Deleted text locations are marked with a single red character (can be toggled off in settings)
- **Optional Markdown Storage**: Store comments in per-note sidenote markdown files located in a configurable folder (defaults to `side-note-comments`)

## How to Use

### Adding a Comment to Selected Text

1. **Select text** in the editor (minimum 3 characters recommended, 10+ characters for best accuracy)
2. **Right-click** the selected text and choose "Add comment to selection"
   - Or use the command palette (`Cmd/Ctrl + P`) → "Side Note: Add comment to selection"
3. An inline form appears in the sidebar — type your comment there
   - Press `Cmd/Ctrl + Enter` to save
   - Press `Esc` to cancel
4. The text will be automatically highlighted using your configured style (default: yellow background with underline)

### Adding a Note Comment (no text selection)

1. Click anywhere in the editor **without selecting text**
2. **Right-click** and choose "Add note comment"
   - Or use the command palette → "Side Note: Add note comment"
3. Type your comment in the inline form that appears in the sidebar
4. Press `Cmd/Ctrl + Enter` to save or `Esc` to cancel

Note comments are attached to the whole file rather than a specific passage. They appear in the sidebar with the file name as their title and a blue left border. Clicking a note comment navigates to the top of the file.

### Viewing Comments

**Option 1: Sidebar Mode**
- Click the message-square icon in the ribbon
- Or run "Side Note: Open in Sidebar" from the command palette
- The view stays in the sidebar and automatically updates as you switch files

**Option 2: Split View Mode**
- Run "Side Note: Open in Split View" from the command palette
- Opens a new pane to the right, displaying comments for the current file

### Navigating Comments

- Click any comment in the side pane to jump to its location in the editor
- **Double-click** any comment to open the edit modal directly
- Click any highlighted text in the editor to open the sidebar (if not already open) and highlight the corresponding comment
- Comments are highlighted directly in the text for easy visual reference

### Searching Comments

Type in the search bar at the top of the Side Note panel to filter comments in real time. The search matches against both the highlighted text and the comment body. Works in both Current File and All Notes views. Japanese, Chinese, Korean, and other IME-based input methods are fully supported — the filter does not interrupt the conversion process.

### Managing Comments

- **Edit**: Click the `...` menu → Edit, or **double-click** the comment — an inline textarea opens in the sidebar. `Cmd/Ctrl + Enter` saves, `Esc` cancels.
- **Delete**: Click the `...` menu → Delete
- **Sort**: Change sort order in Settings → Comment sort order (by position or timestamp)

### Settings

Access settings via Settings → Side Note:

- **Comment Sort Order**: Choose between position in file or timestamp
- **Show Highlights in Editor**: Toggle visual highlights on/off
- **Show Resolved Comments**: Show or hide resolved comments in the sidebar
- **Highlight color**: Choose the color used to highlight commented text
- **Highlight opacity**: Control how transparent the highlight is (0 = invisible, 1 = fully opaque)
- **Highlight style**: Choose how commented text is marked in the editor:
  - *Underline + Background* (default)
  - *Background only*
  - *Underline only*
  - *Dashed underline only*
  - *Wavy underline only*
- **Markdown comments folder**: Configure the folder (relative to vault) for sidenote markdown files
- **Orphaned Comments**: View count and delete orphaned comments in bulk

## Mobile Support

**SideNote v1.0.3 and later** includes full mobile support for both iOS (Obsidian mobile app) and Android devices!

### Mobile Features

- **Responsive Design**: The comment modal automatically adapts to mobile screen sizes
- **Touch-Friendly Buttons**: All buttons have proper touch target sizes (44px minimum) for easy tapping
- **Mobile Keyboard Optimization**: Text input is optimized for mobile keyboards with 16px font size to prevent auto-zoom on iOS
- **Improved Focus Management**: Better focus handling for seamless modal interaction on touch devices
- **Text Selection Support**: Full support for selecting and commenting on text in mobile editors

### How to Add Comments on Mobile

1. Open a note in edit mode
2. **Long-press** the text you want to comment on and drag to select it
   - Start by long-pressing at the beginning of the text and drag to the end
3. Tap the **message icon (💬)** in the **editor toolbar** at the top
   - If you don't see the icon, swipe left or right on the toolbar to find it
4. Enter your comment in the modal that appears
5. Tap the **Add** button to save

### How to View Comments on Mobile

#### **Open Comments in Sidebar**

**iOS (Obsidian iOS app):**
1. Tap the hamburger menu (≡) at the top left
2. Swipe right or run the "Open in Sidebar" command
3. Comments list will appear in the sidebar

**Android (Obsidian Android app):**
1. Tap the menu icon (≡) at the top of the screen
2. Run the "Side Note: Open in Sidebar" command (search for it)
3. Comments list will appear in the right panel

#### **Open from Command Palette**

1. Tap the menu icon (≡ or ⋮) at the top of the screen
2. Open the command palette
3. Search for "side note"
4. Tap "Side Note: Open in Sidebar"
5. The sidebar will open showing all comments for the current note

### Interacting with Comments

- Tap any comment in the sidebar to jump to that location in the editor
- Tap the **edit (pencil)** icon next to a comment to edit it
- Tap the **delete (trash)** icon next to a comment to delete it

### Troubleshooting Mobile Issues

- **Message icon not visible in toolbar**: Swipe left or right on the toolbar to find it. You can customize the mobile toolbar in Obsidian's settings.
- **"Add" button not responding**: Make sure to tap the button firmly. Verify that you've entered text in the comment field (empty comments cannot be saved).
- **Text selection difficult**: Try selecting a longer text span (10+ characters) for more reliable matching.
- **Sidebar won't display**: Open the command palette from the menu (≡) at the top and run "Side Note: Open in Sidebar".

## Important Notes

### Text Tracking Limitations

**Short Text (< 10 characters)**: Comments on very short text may be ambiguous on initial placement if the same short string appears multiple times. For best results, select at least 10 characters when commenting.

**Duplicate Text**: OT-based tracking keeps each comment on its own specific instance through editing sessions. After restarting Obsidian or editing the file externally, stored absolute offsets are checked first; if stale, a ±50-line proximity search re-anchors positions. Identical text within 50 lines of the original may occasionally match the wrong instance.

### Future Plans

**CRDT Migration**: The current OT implementation using CM6's `ChangeSet.mapPos()` works well for single-device editing sessions, but relies on a fallback re-search for cross-device synchronisation (e.g. Obsidian Sync). A planned future direction is to migrate annotation tracking to a full **CRDT (Conflict-free Replicated Data Type)** model — likely via [Yjs](https://github.com/yjs/yjs), the same library that powers real-time collaboration in VS Code Live Share and other editors. This would:
- Eliminate re-searches entirely by encoding position information as a CRDT that converges correctly across any sequence of concurrent edits
- Enable true multi-device annotation sync without conflicts, even when the same note is edited on multiple devices simultaneously while offline
- Remove the remaining edge cases where identical text within the re-search window causes a comment to re-anchor to the wrong occurrence

**Highlight Variations**: ~~Plans to add customizable highlight colors and styles~~ — Added in v1.0.9. Five styles available in settings.

**Richer Editing UI**: Build a richer Markdown editing experience (shortcuts/preview) on top of the new markdown storage option.

## Technical Details

- Comments are stored in `data.json` with the selected text, its SHA256 hash, absolute character offsets (`startOffset`/`endOffset`), and line/character coordinates
- **Highlight tracking** uses Operational Transformation (OT): absolute offsets are transformed via CodeMirror 6's `ChangeSet.mapPos()` on every document change — no text search is performed during an editing session
- `mapPos` biases are `assoc=+1` for the range start and `assoc=-1` for the range end, ensuring text inserted at a highlight boundary stays outside the tracked range
- Orphaned comments (red markers) remain in the OT tracker and continue to follow edits, with automatic recovery when the original text reappears (e.g. after Ctrl+Z)
- On cold start or external file modification, stored absolute offsets are verified first; only if stale does a ±50-line proximity SHA256 search run
- Uses CodeMirror 6 decorations for in-editor highlighting

## Version History

### 1.0.9
- **Fixed "Current File" / "All Notes" toggle showing the wrong mode label** (issue [#27](https://github.com/mofukuru/SideNote/issues))
  - The button was displaying the *next* mode (where clicking would take you) instead of the *current* mode being shown — the opposite of what users expect
  - Fixed: the button now always reflects the currently active view mode
- **Added highlight style setting** (issue [#28](https://github.com/mofukuru/SideNote/issues))
  - New **Highlight style** dropdown in Settings → Side Note with five options:
    - *Underline + Background* (default — same as before)
    - *Background only*
    - *Underline only*
    - *Dashed underline only*
    - *Wavy underline only*
  - Useful for users with many comments who find the combined underline + background visually cluttered
  - Style works alongside the existing color and opacity settings

### 1.0.8
- **Fixed comment navigation scroll position** — clicking a comment in the sidebar now reliably centers the highlighted text in the editor viewport
  - Previously, `editor.focus()` called after `scrollIntoView` would trigger a browser focus-scroll ("nearest" mode) that overrode the intended centered position
  - Fixed by removing the redundant `focus()` call (focus is already handled by `setActiveLeaf`) and adding a short defer so all side-effects of `setActiveLeaf` settle before the scroll runs
- **Enabled `![[embed]]` transclusion rendering in comment text**
  - Embedded notes (`![[note.md]]`) are now rendered inline inside the comment card instead of being converted to plain wiki links
  - Works because `MarkdownRenderer.render` is called with the correct `sourcePath` and `component`, giving it the context it needs to resolve and display the embedded content
  - Migrated from the deprecated `MarkdownRenderer.renderMarkdown` to the current `MarkdownRenderer.render` API
- **Fixed callout and blockquote rendering in comment text**
  - Callouts (`> [!NOTE]`, `> [!WARNING]`, etc.) and blockquotes (`> ...`) were displaying without Obsidian styling — appearing as unstyled plain text
  - Root cause: Obsidian's CSS scopes callout and blockquote styles under a `.markdown-rendered` ancestor; the comment content wrapper was missing that class
  - Fixed by adding `markdown-rendered` to the content wrapper and adding CSS to prevent excessive margins from inflating the comment card height

### 1.0.7
- **Added note comments** — attach a comment to an entire note without selecting any text
  - New "Side Note: Add note comment" command in the command palette
  - Right-clicking in the editor with no text selected now shows "Add note comment"
  - Note comments display the file title as their label (with a blue accent border) and navigate to the top of the file when clicked
  - Note comments are not highlighted in the editor since they have no specific text anchor
- **Fixed `![[embed]]` links and heading links in comment text**
  - `![[note.md]]` was rendered as plain text; it is now converted to a clickable `[[note.md]]` link
  - `[[note#heading]]` links open the linked note at the specified heading
  - `[[#heading]]` links navigate to the heading within the same file
- **Replaced popup modal with inline sidebar editing**
  - Adding and editing comments now happens directly in the sidebar via an inline textarea — no modal appears
  - Works for both note comments and text-selection comments
  - `Ctrl/Cmd+Enter` saves (routed through Obsidian's `Scope` system to avoid conflicts with global hotkeys), `Esc` cancels
  - In-progress drafts are preserved if a background event (e.g. file save) refreshes the sidebar during editing
- **Fixed external URLs and Obsidian protocol links in comment text** (issue [#25](https://github.com/mofukuru/SideNote/issues))
  - Links starting with `https://`, `http://`, `obsidian://`, etc. now open correctly in the system browser/app instead of throwing an error
  - Previously, all hrefs were passed to `openLinkText`, which only handles internal Obsidian links
- **Added Ctrl/Cmd+Click to open wiki links in a new tab** (issue [#24](https://github.com/mofukuru/SideNote/issues))
  - Hold Ctrl (Windows/Linux) or Cmd (Mac) while clicking a `[[WikiLink]]` in a comment to open the linked note in a new tab instead of replacing the current one
- **Fixed OT mapPos bias bug — highlights no longer orphan when editing at their boundary** (issue [#26](https://github.com/mofukuru/SideNote/issues))
  - The `assoc` arguments to `ChangeSet.mapPos()` were reversed: `from` used `-1` (left bias) and `to` used `+1` (right bias)
  - This caused any insertion at the exact start or end of a highlight to expand the tracked range, making the text check fail and immediately orphaning the comment
  - Fixed to `assoc=+1` for `from` and `assoc=-1` for `to`, so boundary insertions stay outside the range
- **Orphaned (red) highlights now follow edits via OT** (issue [#26](https://github.com/mofukuru/SideNote/issues))
  - Previously the red dot froze at the position where the comment became orphaned; any edits before it left the dot pointing at the wrong location
  - A new `orphanedAt` tracker keeps applying `ChangeSet.mapPos()` to the orphan position through every subsequent edit
  - Undo recovery is now instant: when the original text reappears at the tracked position the comment turns yellow again without waiting for a file save
- **Added absolute offset persistence for cross-session accuracy** (issue [#26](https://github.com/mofukuru/SideNote/issues))
  - New `startOffset`/`endOffset` fields are stored in `data.json` and updated by the OT tracker on every change
  - On Obsidian restart the stored offsets are verified first; a re-search runs only if they are stale (e.g. after external sync)
- **Expanded external-sync re-search window from ±10 to ±50 lines**
  - Improves recovery when a note is edited on another device and the commented text has moved many lines

### 1.0.6
- **Fixed `[[WikiLink]]` internal links in comments** (issue [#11](https://github.com/mofukuru/SideNote/issues))
  - Links inside comment text now correctly open the linked note
  - Added an explicit `openLinkText` handler since Obsidian's workspace-level link handler does not activate in custom sidebar views
  - Clicking a link no longer also triggers the "jump to editor position" behaviour
- **Added search filter to sidebar** (issue [#20](https://github.com/mofukuru/SideNote/issues))
  - A search input now appears at the top of the Side Note panel
  - Filters comments in real time by highlighted text and comment body
  - Works in both Current File and All Notes views
  - Japanese, Chinese, Korean, and other IME-based input methods are supported without interrupting the conversion process
- **Double-click to edit** (issue [#19](https://github.com/mofukuru/SideNote/issues))
  - Double-clicking a comment in the sidebar opens the edit modal directly; single-click still jumps to the editor position
- **Redesigned highlight tracking** (issue [#23](https://github.com/mofukuru/SideNote/issues))
  - Replaced text-search-based positioning with Operational Transformation (OT) using CodeMirror 6's `ChangeSet.mapPos()`
  - Highlights follow their exact text through edits without drifting to other occurrences of the same string
  - Deleting commented text immediately marks the comment as orphaned (red marker) instead of moving the highlight elsewhere
  - Removed the full-document hash search (`findTextByHashOptimized`) that was the root cause of highlight drift; a ±10-line proximity search is retained for files edited outside Obsidian
  - Undo (Ctrl+Z) automatically recovers the comment when the file is saved
- **Security hardening** (issue [#21](https://github.com/mofukuru/SideNote/issues))
  - Added `normalizeCommentsFolderPath()`: rejects absolute paths and `..` segments, falls back to default with a Notice
  - Replaced multi-line `[^]*?` regex in markdown block parsing with deterministic `indexOf`-based parsing
  - Fixed event listener leak: bound click handler now stored as a class property and correctly removed on destroy

### 1.0.5
- **Fixed duplicate comment creation** (issue [#16](https://github.com/mofukuru/SideNote/issues/16), [#18](https://github.com/mofukuru/SideNote/issues/18), [#10](https://github.com/mofukuru/SideNote/issues/10))
  - Hardened modal submit handling to prevent double execution from click/touch events
  - Added submit re-entrancy guard and debounce to block rapid repeat submissions
  - Migrated comment identity from timestamp to stable UUID (`id`) for reliable targeting
  - Switched markdown markers to id-based format with legacy timestamp fallback
- **Fixed orphaned comments not recovering** (issue [#15](https://github.com/mofukuru/SideNote/issues/15))
  - Orphaned comments are now re-checked on every file update and automatically recover if the text is found again
- **Added "View all comments" command**
  - New command in the command palette to open a cross-file view showing all comments grouped by note

### 1.0.4
- **Fixed coordinate drift issue on mobile devices**
  - Implemented dynamic text search for highlights to always display at accurate positions during editing
  - Resolved highlight position drift on Android/iOS when editing lines
  - Prevented stale cached coordinates by searching for text on every highlight render
- **Fixed orphaned issue when clicking comments**
  - Resolved issue where clicking comments triggered unnecessary coordinate updates that marked comments as orphaned
  - Removed coordinate update logic from click handlers since dynamic search eliminates the need for updates
- **Added confirmation modal for deletion**
  - Added confirmation modal when pressing the delete button to prevent accidental deletions
  - Provides "Cancel" and "Delete" options for safe deletion operations

### 1.0.3
- **Added full mobile support** for iOS and Android devices
- **Added comment button to mobile editor toolbar** (message icon) for easy access
- Improved comment modal with better focus management
- Added mobile-responsive CSS for touch-friendly interfaces
- Enhanced text selection validation for better error messages
- Optimized keyboard handling for mobile devices
- Increased button touch target sizes (44px) for better mobile usability
- Fixed modal scrolling and visibility issues on mobile
- Added font-size optimization (16px) to prevent iOS auto-zoom

### 1.0.2
- Added click handler on highlighted text to open sidebar and navigate to comment
- Added keyboard shortcuts to comment modal:
  - `Cmd/Ctrl + Enter` to save and close
  - `Esc` to cancel
  - Click outside modal to dismiss
- Fixed bug where highlights didn't appear immediately after adding a comment
- Added visual feedback when clicking on highlights (comment is highlighted in sidebar)
- Added optional markdown storage for comments (per-note sidenote files in configurable folder)
- Added inline→markdown migration when enabling markdown storage
- Renamed sidenote files automatically on note rename and kept references in sync
- Fixed highlight positioning when multiple editors are open for different files

### 1.0.1
- Added hash-based text tracking for robust comment anchoring
- Implemented 3-stage matching strategy (hash+proximity → full-file hash → orphaned)
- Added in-editor highlighting with CodeMirror 6 decorations
- Added orphaned comment detection and management
- Added dual view modes (Sidebar and Split View)
- Added active-leaf-change tracking for auto-update
- Comprehensive README documentation with limitation warnings

### 1.0.0
- Initial release
- Basic comment functionality
- Add, edit, and delete comments
- Side pane view for comment display

## License

This plugin is licensed under the [MIT License](LICENCE).
