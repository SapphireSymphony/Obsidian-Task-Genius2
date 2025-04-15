# Task Genius

Full documentation is available at [Docs](docs/general.md).

---

Task Genius is a comprehensive plugin for Obsidian designed to enhance your task and project management workflow. It integrates seamlessly into your notes, offering visual progress tracking, flexible status management, powerful filtering, and a dedicated view to manage tasks across your vault.

![Task Genius Feature Showcase](./media/task-genius-view.jpg)

## Key Features

-   **Task Progress Bars**: Visualize parent task completion with customizable graphical or text-based progress bars based on sub-task status. Supports headings and non-task list items.
-   **Advanced Task Statuses & Cycling**: Define custom task statuses beyond `- [ ]` and `- [x]` (e.g., In Progress `[/]`, Planned `[?]`, Abandoned `[-]`). Easily cycle through statuses with clicks or commands.
-   **Date & Priority Management**: Quickly add and modify due dates via a calendar picker (`📅 2023-12-25`) and assign priorities (🔺 Highest, ⏫ High, ..., [#A], [#B], [#C]) through context menus, commands, or clickable icons.
-   **In-Editor Task Filtering**: Dynamically filter tasks within a note based on status, content, tags, and relationships (parent/child/sibling) using a toggleable panel. Save and reuse common filters as presets.
-   **Task Mover**: Archive completed or specific sets of sub-tasks to a designated file using commands, keeping your active notes clean.
-   **Quick Capture**: Rapidly capture tasks or notes to a specified file via an inline panel (`Alt+C`), a global command, or a full-featured modal for adding metadata.
-   **Workflow Management**: Define multi-stage workflows (e.g., Todo -> Doing -> Review -> Done) and track tasks through them. Includes options for automatic timestamping, duration tracking, and next-task creation.
-   **Dedicated Task View**: A powerful, unified interface (`Task Genius: Open Task Genius view`) to see, sort, filter, and manage all tasks across your vault. Includes modes like Inbox, Forecast, Tags, Projects, and Review.
-   **Customizable Settings**: Extensive options to configure the appearance and behavior of all features.

## Feature Highlights

### Progress Bars

Automatically adds progress indicators to parent items.

```markdown
- [ ] Parent Task [||||----] [4/8] // Example progress bar and text
    - [x] Sub-task 1
    - [x] Sub-task 2
    - [/] Sub-task 3 (In Progress)
    - [ ] Sub-task 4
    - [-] Sub-task 5 (Abandoned - might be excluded from count based on settings)
    - [?] Sub-task 6 (Planned - might be excluded)
    - [x] Sub-task 7
    - [x] Sub-task 8
```

*   **Customize:** Display mode (bar, text, both), count sub-levels, show on headings/non-tasks, custom text format (placeholders, expressions), conditional hiding (tags, folders, metadata).

### Task Status & Cycling

Define custom markers and cycle through them.

*   **Settings:** Define markers (`x`, `/`, `?`, `-`), configure counting, choose themes, set up custom click cycles.
*   **Usage:** Click markers in Live Preview/Reading (if enabled), use commands (`Cycle task status forward/backward`).

### Date & Priority

Add metadata easily.

*   **Dates:** Click calendar icon or date text (`📅 2023-12-25`) for a picker.
*   **Priorities:** Click icon (🔺) for dropdown, use context menu (`Set priority`), or use commands (`Set priority Highest`, `Remove priority`).

### Task Filtering (Editor)

Focus on specific tasks within a note.

*   **Command:** `Toggle task filter panel`.
*   **Options:** Filter by status, text/tags (`#tag`), related tasks. Save/load presets.

### Task Mover

Archive tasks.

*   **Commands:** `Move all completed subtasks`, `Move direct completed subtasks`, `Move all subtasks`, `Move task`.
*   **Settings:** Define destination file (via Quick Capture settings), add markers (`{{DATE:YYYY-MM-DD}}`), link back to source.

### Quick Capture

Add tasks quickly.

*   **Inline:** `Toggle quick capture panel` (`Alt+C`).
*   **Global:** `Quick capture (Global)`.
*   **Detailed:** `Task capture with metadata`.
*   **Settings:** Define target file, append/prepend/replace mode.

### Workflows

Manage multi-stage processes.

*   **Define:** Create workflows with stages (Cycle, Terminal) in settings.
*   **Use:** Associate tasks (e.g., via tag `#workflow/MyFlow`), use context menu (`Move to Next Stage`), automate timestamps/next tasks.

### Task Genius View

Manage all tasks centrally.

*   **Open:** Ribbon icon or command `Open Task Genius view`.
*   **Modes:** Inbox, Forecast, Tags, Projects, Review.
*   **Interact:** Click tasks to view/edit details (description, date, priority, notes) in the right panel. Complete/cycle status directly. Right-click for context menu.
*   **Manage Index:** Commands `Refresh task index`, `Force reindex all tasks`.

## Installation

### From Obsidian Community Plugins

1.  Open `Settings` -> `Community plugins`.
2.  Make sure "Restricted mode" is **off**.
3.  Click `Browse` community plugins.
4.  Search for "Task Genius".
5.  Click `Install`.
6.  Once installed, `Enable` the plugin.

### Manual Installation

1.  Download the latest release (`main.js`, `manifest.json`, `styles.css`) from the [Releases page](https://github.com/Quorafind/Obsidian-Task-Genius/releases).
2.  Navigate to your Obsidian vault's plugins folder: `YourVault/.obsidian/plugins/`.
3.  Create a new folder named `task-genius`.
4.  Copy the downloaded `main.js`, `manifest.json`, and `styles.css` files into the `task-genius` folder.
5.  Reload Obsidian (or disable and re-enable the plugin).
6.  Enable the plugin in `Settings` -> `Community plugins`.

## Support Me

If you enjoy Task Genius and find it useful, please consider supporting my work by buying me a coffee! It helps me dedicate time to maintaining and improving the plugin.

<a href="https://www.buymeacoffee.com/boninall" target="_blank"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=boninall&button_colour=6495ED&font_colour=ffffff&font_family=Inter&outline_colour=000000&coffee_colour=FFDD00" alt="Buy Me A Coffee"></a>
