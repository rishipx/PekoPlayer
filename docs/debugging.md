# Debug tools

A hidden panel collects what is needed to find a layout, colour or markup problem without guessing. It is built on demand, works the same in the browser, the installed web app and the desktop app, and needs no switch to enable it.

Press **Ctrl+Shift+D** to open or close it.

| Button | What it copies |
| --- | --- |
| **Copy diagnostics** | Release id, page address (without query or fragment), browser and window details, color scheme and reduced-motion settings, which browser features exist (WebGL2, workers, folder picker, file handling, service worker, picture-in-picture), the player and multi-view state, the size of each saved-data entry, and the most recent errors. File names and video titles are left out. |
| **Copy theme tokens** | Every CSS custom property the stylesheets declare, with its value in effect on the page, and the tokens that differ on the multi-view wall. |
| **Copy selector check** | How many elements each named tile part matches (`PekoSelectors`), and any player element the page no longer contains. Run it after changing markup. |
| **Inspect an element** | Highlights the element under the pointer. Clicking one copies its path, box, hover, focus and fullscreen state, computed layout and colors, the nearest background that is really visible, every ancestor that creates a stacking context or clips, and the CSS rules that match it. **Esc** cancels. |

Nothing is stored or sent. Each button only puts text on the clipboard, so you can paste it into an issue or a message.

## Typical uses

- **A box with the wrong color or border:** inspect it. The matching rules show which one wins, and the state line shows whether `:hover`, `:focus-visible` or `:fullscreen` is involved.
- **A control that is clipped or hidden:** the ancestor list names the element that clips it or creates the stacking context.
- **"It works on my machine":** paste the diagnostics into the issue.
