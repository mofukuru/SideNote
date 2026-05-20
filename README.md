# SideNote

SideNote is a plugin for [Obsidian](https://obsidian.md) that allows you to add comments to your notes. These comments are displayed in a dedicated side pane, making it easy to review and navigate annotations without cluttering the main text. Comments are highlighted directly in the editor for quick visual reference.

## Features

### Core Features

- **Add Comment to Selection**: Easily add comments to selected text within your Markdown notes.
- **Dual View Modes**:
  - **Sidebar Mode**: Open comments in the right sidebar for persistent viewing
  - **Split View Mode**: Open comments in a split pane beside your note
- **Visual Highlights**: Commented text is automatically highlighted in the editor (yellow background with underline)
- **Auto-Tracking**: Comments automatically follow their text as you edit your notes using hash-based matching
- **Click to Navigate**:
  - Click any comment in the side pane to jump to its location in the editor
  - Double-click any comment to open the edit modal directly
  - Click any highlighted text in the editor to open the sidebar and highlight the corresponding comment
- **Internal Link Support**: `[[WikiLinks]]` inside comment text are fully clickable and open the linked note
- **Search Filter**: Filter comments in real time by typing in the search bar at the top of the sidebar (matches highlighted text and comment body; works in both Current File and All Notes views)
- **Edit and Delete**: Manage your comments directly from the side pane
- **Keyboard Shortcuts**: Use `Cmd/Ctrl + Enter` to save and close the comment modal, `Esc` to cancel, or click outside the modal to dismiss
- **Flexible Sorting**: Sort comments by their position in the file or by their creation timestamp
- **Orphaned Comment Management**: When the original text is deleted, comments are marked as "orphaned" and can be managed separately

### Advanced Features

- **Operational Transformation Tracking**: Comment positions are stored as absolute character offsets and transformed through every document edit via CodeMirror 6's `ChangeSet.mapPos()`. No text search is performed during editing; highlights follow their exact text in real time.
- **Accurate Duplicate Handling**: When the same string appears in multiple places, each comment tracks its own specific instance. The highlight never drifts to an unrelated occurrence, even when the original text is deleted.
- **Instant Orphan Detection**: When the commented text is deleted, the range collapses immediately and a red marker appears at the last known position — without the highlight moving elsewhere.
- **Undo Recovery**: Pressing Ctrl+Z to restore deleted text automatically recovers the comment when the file is saved.
- **Active File Auto-Update**: When using sidebar mode, the comment view automatically updates as you switch between files
- **Orphaned Comment Highlighting**: Deleted text locations are marked with a single red character (can be toggled off in settings)
- **Optional Markdown Storage**: Store comments in per-note sidenote markdown files located in a configurable folder (defaults to `side-note-comments`)

## How to Use

### Adding Comments

1. **Select text** in the editor (minimum 3 characters recommended, 10+ characters for best accuracy)
2. **Right-click** the selected text and choose "Add comment to selection"
   - Or use the command palette (`Cmd/Ctrl + P`) → "Side Note: Add comment to selection"
3. Enter your comment in the modal that appears
   - Press `Cmd/Ctrl + Enter` to save and close
   - Press `Esc` or click outside the modal to cancel
4. The text will be automatically highlighted in yellow with an underline

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

- **Edit**: Click the `...` menu next to any comment, or **double-click** the comment
- **Delete**: Click the `...` menu → Delete
- **Sort**: Change sort order in Settings → Comment sort order (by position or timestamp)

### Settings

Access settings via Settings → Side Note:

- **Comment Sort Order**: Choose between position in file or timestamp
- **Show Highlights in Editor**: Toggle visual highlights on/off
- **Store Comments as Markdown Files**: Save comments into per-note sidenote markdown files
- **Markdown Comments Folder**: Configure the folder (relative to vault) for sidenote markdown files
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

**Duplicate Text**: OT-based tracking keeps each comment on its own specific instance through editing sessions. After restarting Obsidian or editing the file externally, a ±10-line proximity search re-anchors positions, which may occasionally match the wrong instance if identical text appears within 10 lines of the original.

### Future Enhancements

**Highlight Variations**: Plans to add customizable highlight colors and styles for different comment types.

**Richer Editing UI**: Build a richer Markdown editing experience (shortcuts/preview) on top of the new markdown storage option.

## Technical Details

- Comments are stored in `data.json` with the selected text, its SHA256 hash, and position coordinates
- **Highlight tracking** uses Operational Transformation (OT): positions are stored as absolute character offsets and transformed via CodeMirror 6's `ChangeSet.mapPos()` on every document change — no text search is performed during an editing session
- When commented text is deleted the range collapses (`from === to`) and the comment is immediately marked as orphaned without drifting to another occurrence of the same string
- On file save a ±10-line proximity search with SHA256 hash verification re-anchors positions for files modified outside Obsidian; the previous full-document fallback search has been removed to prevent drift
- Uses CodeMirror 6 decorations for in-editor highlighting

## Version History

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
