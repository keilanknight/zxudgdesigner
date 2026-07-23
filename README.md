# ZX Spectrum UDG Graphics Editor

https://keilanknight.com/speccy

A browser-based editor for designing ZX Spectrum user-defined graphics, arranging them into complete screens, and exporting the result as an auto-loading `.tap` file for an emulator or real hardware.

The editor is deliberately self-contained and straightforward: there is no framework, account, server, or installation process. Open the page, draw some graphics, build screens, and save the project locally.

© 2026 Keilan Knight. Open-source project.

## Why this exists

The ZX Spectrum makes it wonderfully easy to redefine characters, but turning a collection of 8×8 graphics into a complete reusable screen involves rather more work. You have to calculate character bytes, manage colours, place tiles, preserve the work somewhere, and eventually write a loader and renderer.

This project brings that workflow into one visual tool. It is intended for:

- Spectrum BASIC programmers who want usable `DATA` statements without calculating binary rows by hand.
- Retro developers building title screens, maps, panels, character sets, or text-mode artwork.
- Artists who want to experiment with the Spectrum's 8×8 graphics and attribute limitations.
- Newcomers learning how UDGs, INK, PAPER, screen cells, and Spectrum tape files fit together.
- Emulator and real-hardware users who want an immediately loadable result.

## Run the editor

No build step is required for development. Open `index.html` in a modern browser.

For a website, upload the contents of `dist/` together:

```text
dist/
├── index.html
├── styles.css
└── app.js
```

The files use relative paths, so the editor can be hosted in a subdirectory as well as at the root of a site.

## What it can do

### Four UDG banks

The editor provides four banks of 21 UDGs, giving 84 available designs in total. Each bank contains the familiar Spectrum UDG positions A–U.

- Switch banks with the Bank 1–4 buttons.
- Duplicate a complete bank, including saved colours, into the next unused bank.
- Press `1`–`4` when not typing in a form field to change the active screen-design bank.
- Press `A`–`U` to select the corresponding UDG.
- Every UDG remembers its own default INK, PAPER, and BRIGHT preview settings.
- Banks can be mixed freely on the same designed screen.

Only UDGs containing pixel data are packed into a TAP export. Blank slots do not consume eight bytes each in the graphics package.

### 8×8 UDG editor

Select a bank and a letter, then draw directly on the enlarged 8×8 grid.

- Left-drag paints pixels.
- Right-drag erases pixels.
- Clear or invert the complete graphic.
- Duplicate it into the next empty position in the current bank.
- Copy a UDG and its saved colours, then paste it over any letter in any bank. Use `Ctrl`/`Cmd`+`C` and `Ctrl`/`Cmd`+`V` when focus is not inside a form field.
- Mirror horizontally or vertically.
- Rotate left or right.
- Shift one pixel up, down, left, or right.

On touchscreens, tap an empty pixel to add it and tap a filled pixel to remove it. Mouse users retain left-drag drawing and right-drag erasing.

Changes immediately update the palette, repeated tile preview, BASIC data, screen palette, and every painted instance of that UDG on the current screen.

### Repeated tile preview

The 6×6 preview makes repeating edges and patterns easier to spot. Its INK, PAPER, and BRIGHT controls belong to the selected UDG, rather than the screen painter.

Use it to check whether:

- A texture joins cleanly at its left and right edges.
- Top and bottom rows create unwanted seams.
- A pattern becomes too busy when repeated.
- The intended foreground and background colours work together.

These colours are saved as part of the UDG design. They are defaults and do not restrict how the graphic can be coloured on a screen.

### BASIC data export

The editor continuously calculates the eight decimal bytes representing the selected UDG. It can also generate a BASIC listing for the used portion of the current bank. Set the starting DATA line and line-number increment to fit the listing around your own program.

Trailing blank UDG slots are omitted to save BASIC memory. Intentional blank slots between used graphics remain as zero DATA so later UDG letters are still loaded into the correct positions. The generated listing contains no per-letter REM lines.

The optional loader uses the traditional pattern:

```basic
FOR n=0 TO 167
READ a: POKE USR "A"+n,a
NEXT n
```

Use the copy buttons to place either the selected `DATA` statement or the current bank's complete listing on the clipboard.

### Multi-screen designer

Each project can contain multiple 32×24 Spectrum screens.

- Create, duplicate, delete, and navigate between screens.
- Undo or redo the most recent screen edit as a single action.
- Give each screen its own default INK, PAPER, and BRIGHT setting.
- Choose a UDG from the colour preview palette beside the canvas.
- Override the current painting foreground and background without changing the UDG's saved defaults.
- Lock the current painting colours while switching UDGs or banks, then unlock to restore the selected UDG's saved colours.
- Change zoom from 1× to 4×.
- Use Fit zoom to size all 32 columns to the available editor width.
- Show or hide the cell grid.
- Clear a complete screen.

The UDG chooser responds to the zoom level: it stays broad when the canvas is small and becomes progressively narrower as the canvas grows.

On narrow portrait phones, the editor recommends rotating to landscape while still allowing portrait editing and horizontal scrolling. Advanced UDG tools, BASIC export, secondary screen tools, and TAP export start collapsed on small screens to reduce clutter without removing functionality.

Every painted cell stores its bank, UDG letter, INK, PAPER, and BRIGHT setting. A screen can therefore use Bank 1 A beside Bank 4 A and colour the two instances differently.

### Screen tools

The designer includes five placement modes:

- **Paint:** left-drag to paint and right-drag to erase.
- **Rectangle Fill:** drag between opposite corners to fill an area.
- **Copy Region:** drag around a rectangular part of the screen.
- **Paste Region:** click the destination for the copied region's top-left corner.
- **Stamp:** repeatedly place the selected UDG without removing surrounding cells; right-drag still erases.

The copied region is also included in saved project data, so it is available again after reloading a project.

## In-app help

The circle-question button opens a complete guide without leaving the editor. It covers the first-project workflow, UDGs and banks, Spectrum colours, screen tools, keyboard and touch controls, project recovery, BASIC data, exported TAP screens, cloud projects, public links, and QAOP testing. The guide is responsive, keyboard accessible and can be closed with its buttons, the backdrop or `Escape`.

## Suggested workflow

1. Enter a project name.
2. Design the most commonly used graphics in Bank 1.
3. Assign useful default colours and inspect each graphic in the 6×6 preview.
4. Use Banks 2–4 for alternate animation frames, scene-specific graphics, or replacements for the same letter position.
5. Create a screen and select its default INK and PAPER.
6. Choose UDGs from the palette beside the screen and paint the layout.
7. Add or duplicate screens as needed.
8. Save a project JSON file before experimenting with major changes.
9. Export a TAP and load it in an emulator for testing.
10. Copy the BASIC interface instructions if the screens will be called from a larger program.

## Useful design hints

- Keep Bank 1 for graphics shared by most screens. Use later banks for scene-specific alternatives.
- Use the same letter position across banks for related graphics—for example, A could hold four animation frames or four kinds of wall tile.
- Blank UDGs are free in the TAP's packed tile data, so there is no need to fill every position.
- Duplicate a screen before making a variation. This is useful for menus, animation states, and progressive map changes.
- Use Copy Region for repeating rooms, borders, panels, and decorative structures.
- Remember that Spectrum colour attributes apply to a complete 8×8 cell. Different INK or PAPER colours cannot occupy separate pixels within one cell without attribute clash.
- Test on the intended Spectrum model or emulator. Timing, display borders, and 128 BASIC token behaviour can differ from a modern browser preview.

## Saving and loading projects

**New Project** clears the editor and replaces the browser recovery copy with a clean blank project. If the current work has changed since the last project-file save, the editor asks for confirmation first so the action can be cancelled.

**Save Project** downloads a readable JSON file containing:

- All four UDG banks and their pixel data.
- Per-UDG default INK, PAPER, and BRIGHT settings.
- Every screen and painted cell.
- Each screen's preferred UDG bank and default colours.
- The selected bank, UDG, screen, tools, zoom, grid state, and clipboard region.

**Load Project** restores that file. The current project format is version 5. Older single-bank project files remain supported and are loaded into Bank 1; the other banks begin empty. Projects saved before BRIGHT support load with BRIGHT on.

The editor also keeps an automatic recovery copy in the browser's local storage. Refreshing or reopening the page restores the latest work automatically, and the browser warns before leaving while changes have not been saved to a project file. Local recovery belongs to that browser and site address, so **Save Project** is still the portable backup.

Project JSON files are editable, but keeping their array dimensions intact is important. Invalid files are rejected rather than partially loaded.

## TAP export

**Download TAP** creates a real Spectrum tape image containing:

1. An auto-running Sinclair BASIC loader.
2. A compact Z80 machine-code renderer.
3. Only the nonblank UDG definitions created across the four banks.
4. A small lookup table preserving bank and letter relationships.
5. A directory of compressed screens.
6. The compressed screen data and colour attributes.

The package loads at address `50000`. Its renderer entry point is `50016`.

The TAP automatically draws screen 1. To draw another screen from BASIC:

```basic
LET s=2
POKE 50000,s-1
RANDOMIZE USR 50016
```

BASIC screen numbers begin at 1, while the renderer stores them from 0. The control byte at address `50000` performs that conversion through `s-1`.

When a screen is drawn, the renderer:

1. Finds the requested compressed screen.
2. Reconstructs that screen's preferred UDG bank in the normal `USR "A"` area.
3. Clears the Spectrum bitmap and attributes.
4. Draws the screen directly from the packed UDG data.

Direct drawing means one screen can mix UDGs from all four banks even though BASIC exposes only one A–U bank at a time.

If the complete package would extend beyond address `65535`, export stops with an error. Remove screens or simplify densely painted layouts to reduce its size.

## Spectrum compatibility notes

The original 48K Spectrum provides 21 UDG positions corresponding to A–U. In 128 BASIC, the final two character codes are used by the `SPECTRUM` and `PLAY` tokens, so T and U are not normally available in the same way.

Each Spectrum attribute byte applies one INK, one PAPER, and one shared BRIGHT bit to a complete 8×8 cell. BRIGHT therefore changes both colours together. Bright black remains black, giving 15 visually distinct colours rather than 16.

The machine-code renderer draws bitmap data directly and can still use every exported tile. If a BASIC program intends to print UDGs T or U itself, test that behaviour in the exact BASIC mode being targeted.

The exported loader reserves memory with `CLEAR 49999`, loads the package at `50000`, and calls the renderer at `50016`.

## Source layout

```text
.
├── index.html       HTML structure
├── styles.css       Development stylesheet
├── app.js           Editor, persistence, export, assembler, and renderer logic
├── assembler/       Standalone Z80 assembler Studio workspace
├── server/          Cloud API and private configuration template
├── dist/            Minified website build
└── README.md
```

The project intentionally has no runtime dependencies. The development version is plain HTML, CSS, and JavaScript.

### Rebuilding `dist/`

The build script uses Clean CSS for the stylesheet and Terser for JavaScript compression and identifier mangling. Pass a new version every time a deployable build is created:

```sh
./build.sh 1.1.1
```

The version is recorded in `VERSION` and stamped onto both asset URLs:

```html
<link rel="stylesheet" href="styles-1.1.1.css">
<script src="app-1.1.1.js"></script>
```

Browsers can safely retain the versioned CSS and JavaScript filenames. A new build creates new filenames, updates the generated HTML, and removes obsolete generated assets from `dist/`. The generated HTML also contains no-cache metadata, an Apache `.htaccess` rule, and a Netlify/Cloudflare-style `_headers` file instructing the server not to cache `index.html`. If another web server is used, configure the same `Cache-Control: no-cache, no-store, must-revalidate` response header for `index.html`.

The source page uses `?v=dev`, so it continues to work when opened directly without pretending to be a production build.

Minification is kept lightweight so the deployed editor starts quickly. Heavy control-flow obfuscation was deliberately avoided because it more than tripled the JavaScript size and slowed initialisation.

## Cloud projects beta

Cloud Projects are developed separately on the `feature/cloud-projects-beta`
branch. The beta adds private server saves, Google sign-in, explicitly published
project and TAP links, and an administrator view for managing users and projects.

Cloud support is optional. Local browser recovery, downloaded JSON projects, and
ordinary TAP downloads continue to work without an account.

### Using Cloud Projects

1. Open **Cloud Projects** and sign in with Google.
2. Name the cloud copy and choose **Save as New**.
3. Open a cloud project and use **Update Current** or **Save** to update that copy.
4. Choose **Publish TAP** only when the project is ready to share.

Private projects are visible only to their owner and the site administrator.
Publishing creates two deliberately different links:

- **Copy Project Link** copies a public, read-only project page. A visitor may
  open that project in the editor, but cannot overwrite the owner's copy.
- **Copy TAP Link** copies the direct public `.tap` URL for emulators and other
  tools.

Published projects also provide **Download TAP** and **Try in QAOP**. The QAOP
link passes the direct TAP URL to the QAOP JavaScript Spectrum emulator.
**Update TAP** rebuilds an existing publication, while **Unpublish** removes its
public project and TAP links without deleting the private save.

The administrator view lists users, project counts, storage use, and recent
projects. Administrators can disable or re-enable users and delete projects.
Disabling a user also makes that user's published links unavailable.

### Server implementation

The browser sends the same project structure used by the downloaded JSON file.
PHP validates it, stores compressed project data outside the public web
directory, and keeps metadata in SQLite. Published TAP files are also stored
privately and served through a controlled public endpoint.

To build the beta:

```sh
./build.sh 2.0.0-beta.3
```

The build copies the PHP API into `dist/api` and adds the rewrite rule used for
short TAP links. Private configuration is not included in `dist`. Copy
`server/config.example.php` to the server-side data directory as `config.php`,
then set the Google OAuth web client ID and administrator email.

For Google Identity Services, configure this authorised JavaScript origin:

```text
https://keilanknight.com
```

No Google password or access token is stored. The verified Google account ID is
used as the stable identity; the accompanying name, email address, and profile
picture are stored for account display and administration.

## Spectrum Studio assembler preview

The `feature/spectrum-studio` branch introduces a separate assembler workspace
at `/assembler/`. It deliberately remains a separate page so the graphics and
assembly interfaces stay focused and each tool loads only what it needs. Shared
navigation makes them feel like parts of the same Spectrum Studio.

The preview assembler currently provides:

- A two-pass Z80 assembler with labels, symbols and common directives.
- Clickable errors, a generated listing and a symbol table.
- Fixed-height scrolling results plus collapsible Results, Export, and
  Instruction Help panels.
- Decimal BASIC DATA and hexadecimal byte export.
- Code-only TAP export.
- A self-running TAP containing a short Sinclair BASIC loader and the assembled
  code block. This is the default and most useful option for emulator testing.

Assembler cloud projects and direct QAOP launching are intentionally deferred
until the assembler engine and its TAP output have been tested. The longer-term
plan is to share project storage, authentication and Spectrum TAP utilities
without coupling the two editor interfaces together.

## Release

The stable production release is `v1.7.0`. Cloud work is currently available as
the `v2.0.0-beta` series on `feature/cloud-projects-beta`.

The ready-to-deploy version is in `dist/`. The unminified source files remain the best place to study, modify, or contribute to the editor.

## Project status

This is an open-source project created and maintained by Keilan Knight. Bug reports, compatibility findings, workflow ideas, and improvements are welcome.

Before redistributing modified versions, add an explicit licence file appropriate to the way you want the project to be reused; the repository currently identifies the project as open source but does not yet include a formal software licence.
