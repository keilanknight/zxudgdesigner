"use strict";

const UDG_COUNT = 21;
const UDG_BANK_COUNT = 4;
const GRID_SIZE = 8;
const SCREEN_COLS = 32;
const SCREEN_ROWS = 24;
const RECOVERY_STORAGE_KEY = "zx-udg-designer-recovery-v1";

const spectrumColours = {
  Black: "#000000",
  Blue: "#0000cd",
  Red: "#cd0000",
  Magenta: "#cd00cd",
  Green: "#00cd00",
  Cyan: "#00cdcd",
  Yellow: "#cdcd00",
  White: "#cdcdcd"
};

const spectrumBrightColours = {
  Black: "#000000",
  Blue: "#0000ff",
  Red: "#ff0000",
  Magenta: "#ff00ff",
  Green: "#00ff00",
  Cyan: "#00ffff",
  Yellow: "#ffff00",
  White: "#ffffff"
};

function spectrumColour(name, bright = true) {
  return (bright ? spectrumBrightColours : spectrumColours)[name];
}

const udgBanks = Array.from(
  { length: UDG_BANK_COUNT },
  () => Array.from(
    { length: UDG_COUNT },
    () => Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0))
  )
);

const udgColourBanks = Array.from(
  { length: UDG_BANK_COUNT },
  () => Array.from(
    { length: UDG_COUNT },
    () => ({ ink: "White", paper: "Black", bright: true })
  )
);

let selectedBank = 0;
let udgs = udgBanks[selectedBank];
let udgColours = udgColourBanks[selectedBank];

function createBlankScreen(
  defaultInk = "White",
  defaultPaper = "Black",
  activeBank = 0,
  defaultBright = true
) {
  return {
    defaultInk,
    defaultPaper,
    defaultBright,
    activeBank,
    cells: Array.from(
      { length: SCREEN_ROWS },
      () => Array(SCREEN_COLS).fill(null)
    )
  };
}

const screens = [createBlankScreen()];
let selectedScreen = 0;

function currentScreenObject() {
  return screens[selectedScreen];
}

function currentScreen() {
  return currentScreenObject().cells;
}

let selectedUdg = 0;
let udgDrawing = false;
let udgDrawValue = 1;
let udgPointerId = null;

let screenDrawing = false;
let screenPointerId = null;
let screenDrawAction = "paint";
let screenMode = "paint";
let dragStart = null;
let dragCurrent = null;
let copiedRegion = null;
let copiedUdg = null;
let screenUndoState = null;
let screenRedoState = null;
let projectHasUnsavedChanges = false;
let recoveryTimer = null;

const udgList = document.getElementById("udgList");
const editorBankTabs = document.getElementById("editorBankTabs");
const bankStatus = document.getElementById("bankStatus");
const screenUdgList = document.getElementById("screenUdgList");
const screenBankTabs = document.getElementById("screenBankTabs");
const editor = document.getElementById("editor");
const tilePreview = document.getElementById("tilePreview");
const udgInkSelect = document.getElementById("udgInk");
const udgPaperSelect = document.getElementById("udgPaper");
const udgBrightSelect = document.getElementById("udgBright");
const screen = document.getElementById("screen");
const screenWrap = document.querySelector(".screen-wrap");
const selectedLabel = document.getElementById("selectedLabel");
const dataOutput = document.getElementById("dataOutput");
const allDataOutput = document.getElementById("allDataOutput");
const foregroundSelect = document.getElementById("foreground");
const backgroundSelect = document.getElementById("background");
const brightSelect = document.getElementById("bright");
const lockPaintColoursCheckbox = document.getElementById("lockPaintColours");
const status = document.getElementById("status");
const modeIndicator = document.getElementById("modeIndicator");
const projectNameInput = document.getElementById("projectName");
const projectFileInput = document.getElementById("projectFile");
const includePokeCheckbox = document.getElementById("includePoke");
const basicStartLineInput = document.getElementById("basicStartLine");
const basicLineIncrementInput = document.getElementById("basicLineIncrement");
const defaultInkSelect = document.getElementById("defaultInk");
const defaultPaperSelect = document.getElementById("defaultPaper");
const defaultBrightSelect = document.getElementById("defaultBright");
const screenNumber = document.getElementById("screenNumber");
const undoScreenButton = document.getElementById("undoScreen");
const redoScreenButton = document.getElementById("redoScreen");
const tapNameInput = document.getElementById("tapName");
const tapStatus = document.getElementById("tapStatus");
const tapInstructions = document.getElementById("tapInstructions");
const openHelpButton = document.getElementById("openHelp");
const helpOverlay = document.getElementById("helpOverlay");
const closeHelpButton = document.getElementById("closeHelp");
const closeHelpBottomButton = document.getElementById("closeHelpBottom");
const helpDialogBody = helpOverlay.querySelector(".help-dialog-body");
const pasteUdgButton = document.getElementById("pasteUdg");
let helpPreviousFocus = null;
const openCloudButton = document.getElementById("openCloud");
const cloudOverlay = document.getElementById("cloudOverlay");
const closeCloudButton = document.getElementById("closeCloud");
const cloudStatus = document.getElementById("cloudStatus");
const cloudSignedOut = document.getElementById("cloudSignedOut");
const cloudSignedIn = document.getElementById("cloudSignedIn");
const googleSignInButton = document.getElementById("googleSignInButton");
const googleSetupMessage = document.getElementById("googleSetupMessage");
const cloudUserPicture = document.getElementById("cloudUserPicture");
const cloudUserName = document.getElementById("cloudUserName");
const cloudUserEmail = document.getElementById("cloudUserEmail");
const cloudProjectNameInput = document.getElementById("cloudProjectName");
const cloudSaveNewButton = document.getElementById("cloudSaveNew");
const cloudUpdateButton = document.getElementById("cloudUpdate");
const cloudProjectList = document.getElementById("cloudProjectList");
const sharedProjectPanel = document.getElementById("sharedProjectPanel");
const sharedProjectName = document.getElementById("sharedProjectName");
const sharedProjectOwner = document.getElementById("sharedProjectOwner");
const sharedTapLink = document.getElementById("sharedTapLink");
const sharedQaopLink = document.getElementById("sharedQaopLink");
const openCloudAdminButton = document.getElementById("openCloudAdmin");
const cloudAdminPanel = document.getElementById("cloudAdminPanel");
const adminSummary = document.getElementById("adminSummary");
const adminUserList = document.getElementById("adminUserList");
const adminProjectList = document.getElementById("adminProjectList");
let cloudPreviousFocus = null;
let cloudConfig = null;
let cloudUser = null;
let cloudProjects = [];
let currentCloudProjectId = null;
let sharedCloudProject = null;
let googleScriptPromise = null;

function blankGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
}

function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

function cloneCell(cell) {
  return cell === null ? null : { ...cell };
}

function captureScreenState() {
  return {
    selectedScreen,
    screens: screens.map((screenObject) => cloneScreen(screenObject))
  };
}

function updateScreenUndoButtons() {
  undoScreenButton.disabled = screenUndoState === null;
  redoScreenButton.disabled = screenRedoState === null;
}

function recordScreenUndo() {
  screenUndoState = captureScreenState();
  screenRedoState = null;
  updateScreenUndoButtons();
}

function restoreScreenState(state) {
  screens.length = 0;
  state.screens.forEach((screenObject) => screens.push(cloneScreen(screenObject)));
  selectedScreen = Math.max(0, Math.min(screens.length - 1, state.selectedScreen));
  refreshScreenControls();
}

function scheduleRecoverySave() {
  window.clearTimeout(recoveryTimer);
  recoveryTimer = window.setTimeout(saveRecoveryProject, 250);
}

function markProjectChanged() {
  projectHasUnsavedChanges = true;
  scheduleRecoverySave();
}

function showStatus(message) {
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 1700);
}

function showBankStatus(message) {
  bankStatus.textContent = message;
  window.setTimeout(() => {
    if (bankStatus.textContent === message) bankStatus.textContent = "";
  }, 2400);
}

function buildColourSelectors() {
  Object.keys(spectrumColours).forEach((name) => {
    foregroundSelect.appendChild(new Option(name, name));
    backgroundSelect.appendChild(new Option(name, name));
    udgInkSelect.appendChild(new Option(name, name));
    udgPaperSelect.appendChild(new Option(name, name));
    defaultInkSelect.appendChild(new Option(name, name));
    defaultPaperSelect.appendChild(new Option(name, name));
  });

  foregroundSelect.value = "White";
  backgroundSelect.value = "Black";
  udgInkSelect.value = "White";
  udgPaperSelect.value = "Black";
  udgBrightSelect.value = "on";
  defaultInkSelect.value = "White";
  defaultPaperSelect.value = "Black";
  defaultBrightSelect.value = "on";
  brightSelect.value = "on";
}

function applySelectedUdgColours(index = selectedUdg) {
  foregroundSelect.value = udgColours[index].ink;
  backgroundSelect.value = udgColours[index].paper;
  brightSelect.value = udgColours[index].bright ? "on" : "off";
}

function selectUdgForScreen(index) {
  selectedUdg = index;
  currentScreenObject().activeBank = selectedBank;

  if (!lockPaintColoursCheckbox.checked) {
    applySelectedUdgColours(index);
  }

  refreshAll();
}

function selectBank(index, useForScreen = false) {
  selectedBank = Math.max(0, Math.min(UDG_BANK_COUNT - 1, index));
  udgs = udgBanks[selectedBank];
  udgColours = udgColourBanks[selectedBank];

  if (useForScreen) {
    currentScreenObject().activeBank = selectedBank;

    if (!lockPaintColoursCheckbox.checked) {
      applySelectedUdgColours();
    }
  }

  refreshAll();
}

function buildBankTabs(container, useForScreen) {
  for (let index = 0; index < UDG_BANK_COUNT; index++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bank-tab";
    button.dataset.bank = String(index);
    button.textContent = "Bank " + (index + 1);
    button.addEventListener("click", () => selectBank(index, useForScreen));
    container.appendChild(button);
  }
}

function buildScreenUdgList() {
  for (let index = 0; index < UDG_COUNT; index++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "screen-udg-choice";
    button.dataset.index = String(index);
    button.title = "Select UDG " + String.fromCharCode(65 + index);

    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;

    const label = document.createElement("span");
    label.textContent = String.fromCharCode(65 + index);

    button.append(canvas, label);
    button.addEventListener("click", () => selectUdgForScreen(index));
    screenUdgList.appendChild(button);
  }
}

function buildUdgList() {
  for (let i = 0; i < UDG_COUNT; i++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "udg-choice";
    button.dataset.index = String(i);

    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 8;

    const label = document.createElement("span");
    label.textContent = String.fromCharCode(65 + i);

    button.append(canvas, label);

    button.addEventListener("click", () => {
      selectedUdg = i;
      refreshAll();
    });

    udgList.appendChild(button);
  }
}

function buildEditor() {
  editor.addEventListener("contextmenu", (event) => event.preventDefault());

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const pixel = document.createElement("div");
      pixel.className = "editor-pixel";
      pixel.dataset.row = String(row);
      pixel.dataset.col = String(col);

      editor.appendChild(pixel);
    }
  }

  editor.addEventListener("pointerdown", (event) => {
    const pixel = event.target.closest(".editor-pixel");

    if (!pixel) return;

    event.preventDefault();
    udgDrawing = true;
    udgPointerId = event.pointerId;
    udgDrawValue = event.pointerType === "touch" || event.pointerType === "pen"
      ? (udgs[selectedUdg][Number(pixel.dataset.row)][Number(pixel.dataset.col)] ? 0 : 1)
      : (event.button === 2 ? 0 : 1);

    if (editor.setPointerCapture) {
      editor.setPointerCapture(event.pointerId);
    }

    setEditorPixel(
      Number(pixel.dataset.row),
      Number(pixel.dataset.col),
      udgDrawValue
    );
  });

  editor.addEventListener("pointermove", (event) => {
    if (!udgDrawing || event.pointerId !== udgPointerId) return;
    if (
      event.pointerType !== "touch" &&
      event.pointerType !== "pen" &&
      event.buttons === 0
    ) return;

    const pointElement = document.elementFromPoint(event.clientX, event.clientY);
    const pixel = pointElement
      ? pointElement.closest(".editor-pixel")
      : null;

    if (pixel && editor.contains(pixel)) {
      setEditorPixel(
        Number(pixel.dataset.row),
        Number(pixel.dataset.col),
        udgDrawValue
      );
    }
  });

  const finishUdgDrawing = (event) => {
    if (udgPointerId !== null && event.pointerId !== udgPointerId) return;
    udgDrawing = false;
    udgPointerId = null;
  };

  editor.addEventListener("pointerup", finishUdgDrawing);
  editor.addEventListener("pointercancel", finishUdgDrawing);

  window.addEventListener("pointerup", () => {
    udgDrawing = false;
    udgPointerId = null;
    screenPointerId = null;
    finishScreenDrag();
  });
}

function buildScreen() {
  screen.addEventListener("contextmenu", (event) => event.preventDefault());

  for (let row = 0; row < SCREEN_ROWS; row++) {
    for (let col = 0; col < SCREEN_COLS; col++) {
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      canvas.className = "screen-cell";
      canvas.dataset.row = String(row);
      canvas.dataset.col = String(col);

      screen.appendChild(canvas);
      drawScreenCell(row, col);
    }
  }

  screen.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest(".screen-cell");
    if (!cell) return;

    event.preventDefault();
    screenPointerId = event.pointerId;

    if (screen.setPointerCapture) {
      screen.setPointerCapture(event.pointerId);
    }

    handleScreenPointerDown(
      Number(cell.dataset.row),
      Number(cell.dataset.col),
      event.button,
      event.pointerType === "touch" || event.pointerType === "pen"
    );
  });

  screen.addEventListener("pointermove", (event) => {
    if (!screenDrawing || event.pointerId !== screenPointerId) return;
    if (
      event.pointerType !== "touch" &&
      event.pointerType !== "pen" &&
      event.buttons === 0
    ) return;

    const pointElement = document.elementFromPoint(event.clientX, event.clientY);
    const cell = pointElement ? pointElement.closest(".screen-cell") : null;

    if (cell && screen.contains(cell)) {
      handleScreenPointerMove(
        Number(cell.dataset.row),
        Number(cell.dataset.col)
      );
    }
  });

  const finishScreenPointer = (event) => {
    if (screenPointerId !== null && event.pointerId !== screenPointerId) return;
    screenPointerId = null;
    finishScreenDrag();
  };

  screen.addEventListener("pointerup", finishScreenPointer);
  screen.addEventListener("pointercancel", finishScreenPointer);
}

function handleScreenPointerDown(row, col, button, isTouchPointer) {
  const rightClick = button === 2;

  if (screenMode === "paint") {
    recordScreenUndo();
    screenDrawing = true;
    screenDrawAction = isTouchPointer
      ? (currentScreen()[row][col] ? "erase" : "paint")
      : (rightClick ? "erase" : "paint");
    applyScreenAction(row, col, screenDrawAction);
    return;
  }

  if (screenMode === "stamp") {
    recordScreenUndo();
    screenDrawing = true;
    screenDrawAction = isTouchPointer
      ? (currentScreen()[row][col] ? "erase" : "stamp")
      : (rightClick ? "erase" : "stamp");
    applyScreenAction(row, col, screenDrawAction);
    return;
  }

  if (screenMode === "paste") {
    pasteRegion(row, col);
    return;
  }

  if (screenMode === "rectangle") recordScreenUndo();
  dragStart = { row, col };
  dragCurrent = { row, col };
  screenDrawing = true;
  updateSelectionHighlight();
}

function handleScreenPointerMove(row, col) {
  if (screenMode === "paint" || screenMode === "stamp") {
    applyScreenAction(row, col, screenDrawAction);
    return;
  }

  dragCurrent = { row, col };
  updateSelectionHighlight();
}

function finishScreenDrag() {
  if (!screenDrawing) {
    return;
  }

  screenDrawing = false;

  if (!dragStart || !dragCurrent) {
    return;
  }

  const bounds = getSelectionBounds();

  if (screenMode === "rectangle") {
    for (let row = bounds.top; row <= bounds.bottom; row++) {
      for (let col = bounds.left; col <= bounds.right; col++) {
        paintCell(row, col);
      }
    }
  }

  if (screenMode === "copy") {
    copiedRegion = [];

    for (let row = bounds.top; row <= bounds.bottom; row++) {
      const copiedRow = [];

      for (let col = bounds.left; col <= bounds.right; col++) {
        copiedRow.push(cloneCell(currentScreen()[row][col]));
      }

      copiedRegion.push(copiedRow);
    }

    showStatus(
      "Copied " +
      (bounds.right - bounds.left + 1) +
      " × " +
      (bounds.bottom - bounds.top + 1) +
      " region"
    );
  }

  clearSelectionHighlight();
  dragStart = null;
  dragCurrent = null;
}

function applyScreenAction(row, col, action) {
  if (action === "erase") {
    currentScreen()[row][col] = null;
    drawScreenCell(row, col);
    markProjectChanged();
    return;
  }

  paintCell(row, col);
}

function paintCell(row, col) {
  currentScreen()[row][col] = {
    bank: selectedBank,
    udg: selectedUdg,
    foreground: foregroundSelect.value,
    background: backgroundSelect.value,
    bright: brightSelect.value === "on"
  };

  drawScreenCell(row, col);
  markProjectChanged();
}

function pasteRegion(startRow, startCol) {
  if (!copiedRegion) {
    showStatus("Copy a region first");
    return;
  }

  recordScreenUndo();

  for (let row = 0; row < copiedRegion.length; row++) {
    for (let col = 0; col < copiedRegion[row].length; col++) {
      const targetRow = startRow + row;
      const targetCol = startCol + col;

      if (targetRow < SCREEN_ROWS && targetCol < SCREEN_COLS) {
        currentScreen()[targetRow][targetCol] = cloneCell(copiedRegion[row][col]);
        drawScreenCell(targetRow, targetCol);
      }
    }
  }
}

function getSelectionBounds() {
  return {
    top: Math.min(dragStart.row, dragCurrent.row),
    bottom: Math.max(dragStart.row, dragCurrent.row),
    left: Math.min(dragStart.col, dragCurrent.col),
    right: Math.max(dragStart.col, dragCurrent.col)
  };
}

function clearSelectionHighlight() {
  screen.querySelectorAll(".selection").forEach((cell) => {
    cell.classList.remove("selection");
  });
}

function updateSelectionHighlight() {
  clearSelectionHighlight();

  if (!dragStart || !dragCurrent) {
    return;
  }

  const bounds = getSelectionBounds();

  for (let row = bounds.top; row <= bounds.bottom; row++) {
    for (let col = bounds.left; col <= bounds.right; col++) {
      screen.children[(row * SCREEN_COLS) + col].classList.add("selection");
    }
  }
}

function refreshWholeScreen() {
  for (let row = 0; row < SCREEN_ROWS; row++) {
    for (let col = 0; col < SCREEN_COLS; col++) {
      drawScreenCell(row, col);
    }
  }
}

function refreshScreenControls() {
  screenNumber.textContent =
    "Screen " + (selectedScreen + 1) + " of " + screens.length;

  defaultInkSelect.value = currentScreenObject().defaultInk;
  defaultPaperSelect.value = currentScreenObject().defaultPaper;
  defaultBrightSelect.value = currentScreenObject().defaultBright ? "on" : "off";
  selectBank(currentScreenObject().activeBank, true);
  refreshWholeScreen();
}

function cloneScreen(screenObject) {
  return {
    defaultInk: screenObject.defaultInk,
    defaultPaper: screenObject.defaultPaper,
    defaultBright: screenObject.defaultBright,
    activeBank: screenObject.activeBank,
    cells: screenObject.cells.map((row) =>
      row.map((cell) => cloneCell(cell))
    )
  };
}

function setScreenMode(mode) {
  screenMode = mode;
  clearSelectionHighlight();
  dragStart = null;
  dragCurrent = null;

  const buttons = {
    paint: "paintMode",
    rectangle: "rectangleMode",
    copy: "copyMode",
    paste: "pasteMode",
    stamp: "stampMode"
  };

  Object.entries(buttons).forEach(([name, id]) => {
    document.getElementById(id).classList.toggle("active", name === mode);
  });

  const messages = {
    paint: "Mode: Paint — left-drag paints, right-drag erases.",
    rectangle: "Mode: Rectangle Fill — drag a rectangle to fill it.",
    copy: "Mode: Copy Region — drag around the region to copy.",
    paste: "Mode: Paste Region — click the top-left destination.",
    stamp: "Mode: Stamp — drag to place the selected UDG; right-drag erases."
  };

  modeIndicator.textContent = messages[mode];
}

function replaceSelectedGrid(newGrid) {
  udgs[selectedUdg] = newGrid;
  markProjectChanged();
  refreshAll();
  refreshPaintedCopies(selectedUdg);
}

function setEditorPixel(row, col, value) {
  if (udgs[selectedUdg][row][col] === value) return;
  udgs[selectedUdg][row][col] = value;
  markProjectChanged();
  refreshEditor();
  refreshUdgPreview(selectedUdg);
  refreshTilePreview();
  refreshScreenUdgPreview(selectedUdg);
  refreshDataOutput();
  refreshPaintedCopies(selectedUdg);
}

function refreshEditor() {
  editor.querySelectorAll(".editor-pixel").forEach((pixel) => {
    const row = Number(pixel.dataset.row);
    const col = Number(pixel.dataset.col);
    pixel.classList.toggle("on", udgs[selectedUdg][row][col] === 1);
  });
}

function refreshUdgPreview(index) {
  const button = udgList.querySelector(`[data-index="${index}"]`);
  const canvas = button.querySelector("canvas");
  const context = canvas.getContext("2d");

  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000000";

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (udgs[index][row][col]) {
        context.fillRect(col * 2, row, 2, 1);
      }
    }
  }
}

function refreshTilePreview() {
  const context = tilePreview.getContext("2d");
  const graphic = udgs[selectedUdg];
  const colours = udgColours[selectedUdg];

  context.imageSmoothingEnabled = false;
  context.fillStyle = spectrumColour(colours.paper, colours.bright);
  context.fillRect(0, 0, tilePreview.width, tilePreview.height);
  context.fillStyle = spectrumColour(colours.ink, colours.bright);

  for (let tileRow = 0; tileRow < 6; tileRow++) {
    for (let tileCol = 0; tileCol < 6; tileCol++) {
      for (let pixelRow = 0; pixelRow < GRID_SIZE; pixelRow++) {
        for (let pixelCol = 0; pixelCol < GRID_SIZE; pixelCol++) {
          if (graphic[pixelRow][pixelCol]) {
            context.fillRect(
              tileCol * GRID_SIZE + pixelCol,
              tileRow * GRID_SIZE + pixelRow,
              1,
              1
            );
          }
        }
      }
    }
  }
}

function refreshScreenUdgPreview(index) {
  const button = screenUdgList.querySelector(`[data-index="${index}"]`);
  const canvas = button.querySelector("canvas");
  const context = canvas.getContext("2d");
  const colours = udgColours[index];

  context.imageSmoothingEnabled = false;
  context.fillStyle = spectrumColour(colours.paper, colours.bright);
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = spectrumColour(colours.ink, colours.bright);

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (udgs[index][row][col]) {
        context.fillRect(col, row, 1, 1);
      }
    }
  }
}

function getGridBytes(grid) {
  return grid.map((row) => {
    let value = 0;

    for (let col = 0; col < GRID_SIZE; col++) {
      if (row[col]) {
        value |= 1 << (7 - col);
      }
    }

    return value;
  });
}

function getUdgBytes(index) {
  return getGridBytes(udgs[index]);
}

function getBasicLineSetting(input, fallback) {
  const value = Number.parseInt(input.value, 10);
  return Number.isInteger(value) && value > 0 ? Math.min(9999, value) : fallback;
}

function getLastUsedUdgIndex() {
  for (let index = UDG_COUNT - 1; index >= 0; index--) {
    if (getUdgBytes(index).some((value) => value !== 0)) return index;
  }

  return -1;
}

function refreshDataOutput() {
  const startLine = getBasicLineSetting(basicStartLineInput, 1000);
  const increment = getBasicLineSetting(basicLineIncrementInput, 10);
  dataOutput.value =
    startLine + " DATA " + getUdgBytes(selectedUdg).join(",");

  const lastUsedIndex = getLastUsedUdgIndex();
  const listingLines = [];

  if (includePokeCheckbox.checked && lastUsedIndex >= 0) {
    const finalByteOffset = ((lastUsedIndex + 1) * GRID_SIZE) - 1;
    listingLines.push(
      startLine + " FOR n=0 TO " + finalByteOffset,
      (startLine + increment) + " READ a: POKE USR \"A\"+n,a",
      (startLine + (increment * 2)) + " NEXT n"
    );
  }

  const dataStartLine = startLine +
    (includePokeCheckbox.checked && lastUsedIndex >= 0 ? increment * 3 : 0);

  for (let index = 0; index <= lastUsedIndex; index++) {
    listingLines.push(
      (dataStartLine + (index * increment)) +
      " DATA " + getUdgBytes(index).join(",")
    );
  }

  allDataOutput.value = listingLines.join("\n");
}

function drawScreenCell(row, col) {
  const canvas = screen.children[(row * SCREEN_COLS) + col];
  const context = canvas.getContext("2d");
  const cell = currentScreen()[row][col];

  context.imageSmoothingEnabled = false;

  if (cell === null) {
    context.fillStyle = spectrumColour(
      currentScreenObject().defaultPaper,
      currentScreenObject().defaultBright
    );
    context.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const cellBank = Number.isInteger(cell.bank) ? cell.bank : 0;
  const graphic = udgBanks[cellBank][cell.udg];

  context.fillStyle = spectrumColour(cell.background, cell.bright !== false);
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = spectrumColour(cell.foreground, cell.bright !== false);

  for (let pixelRow = 0; pixelRow < GRID_SIZE; pixelRow++) {
    for (let pixelCol = 0; pixelCol < GRID_SIZE; pixelCol++) {
      if (graphic[pixelRow][pixelCol]) {
        context.fillRect(pixelCol * 2, pixelRow * 2, 2, 2);
      }
    }
  }
}

function refreshPaintedCopies(udgIndex) {
  for (let row = 0; row < SCREEN_ROWS; row++) {
    for (let col = 0; col < SCREEN_COLS; col++) {
      const cell = currentScreen()[row][col];

      if (
        cell !== null &&
        (Number.isInteger(cell.bank) ? cell.bank : 0) === selectedBank &&
        cell.udg === udgIndex
      ) {
        drawScreenCell(row, col);
      }
    }
  }
}

function refreshAll() {
  selectedLabel.textContent =
    "Bank " + (selectedBank + 1) + " · UDG " + String.fromCharCode(65 + selectedUdg) +
    " (" + (selectedUdg + 1) + " of " + UDG_COUNT + ")";

  udgList.querySelectorAll(".udg-choice").forEach((button, index) => {
    button.classList.toggle("selected", index === selectedUdg);
    refreshUdgPreview(index);
  });

  udgInkSelect.value = udgColours[selectedUdg].ink;
  udgPaperSelect.value = udgColours[selectedUdg].paper;
  udgBrightSelect.value = udgColours[selectedUdg].bright ? "on" : "off";

  screenUdgList.querySelectorAll(".screen-udg-choice").forEach((button, index) => {
    button.classList.toggle("selected", index === selectedUdg);
    refreshScreenUdgPreview(index);
  });

  document.querySelectorAll(".bank-tab").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.bank) === selectedBank);
  });

  refreshEditor();
  refreshTilePreview();
  refreshDataOutput();
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const temporary = document.createElement("textarea");
    temporary.value = text;
    document.body.appendChild(temporary);
    temporary.select();
    document.execCommand("copy");
    temporary.remove();
  }

  showStatus(message);
}

document.getElementById("exportTap").addEventListener("click", exportTapFile);
tapNameInput.addEventListener("input", refreshTapInstructions);

document.getElementById("saveProject").addEventListener("click", saveProjectFile);

document.getElementById("newProject").addEventListener("click", startNewProject);

document.getElementById("loadProject").addEventListener("click", () => {
  projectFileInput.click();
});

projectFileInput.addEventListener("change", () => {
  openProjectFile(projectFileInput.files[0]);
});

function bankHasCustomContent(bankIndex) {
  const hasPixels = udgBanks[bankIndex].some((grid) =>
    grid.some((row) => row.some((pixel) => pixel !== 0))
  );
  const hasCustomColours = udgColourBanks[bankIndex].some((colours) =>
    colours.ink !== "White" ||
    colours.paper !== "Black" ||
    colours.bright !== true
  );

  return hasPixels || hasCustomColours;
}

function bankIsUsedByScreen(bankIndex) {
  return screens.some((screenObject) =>
    screenObject.activeBank === bankIndex ||
    screenObject.cells.some((row) =>
      row.some((cell) => cell !== null && cell.bank === bankIndex)
    )
  );
}

function bankIsFree(bankIndex) {
  return !bankHasCustomContent(bankIndex) && !bankIsUsedByScreen(bankIndex);
}

function duplicateSelectedBank() {
  if (!bankHasCustomContent(selectedBank)) {
    showBankStatus("Current bank is empty");
    return;
  }

  let targetBank = -1;

  for (let offset = 1; offset < UDG_BANK_COUNT; offset++) {
    const candidate = (selectedBank + offset) % UDG_BANK_COUNT;
    if (bankIsFree(candidate)) {
      targetBank = candidate;
      break;
    }
  }

  if (targetBank === -1) {
    showBankStatus("No free UDG banks available");
    return;
  }

  const sourceBank = selectedBank;
  udgBanks[targetBank] = udgBanks[sourceBank].map((grid) => cloneGrid(grid));
  udgColourBanks[targetBank] = udgColourBanks[sourceBank].map((colours) => ({
    ...colours
  }));
  markProjectChanged();
  selectBank(targetBank);
  showBankStatus(
    "Bank " + (sourceBank + 1) + " duplicated to Bank " + (targetBank + 1)
  );
}

function copySelectedUdg() {
  copiedUdg = {
    sourceBank: selectedBank,
    sourceUdg: selectedUdg,
    grid: cloneGrid(udgs[selectedUdg]),
    colours: { ...udgColours[selectedUdg] }
  };
  pasteUdgButton.disabled = false;
  showStatus(
    "Copied Bank " + (selectedBank + 1) + " UDG " +
    String.fromCharCode(65 + selectedUdg)
  );
}

function pasteCopiedUdg() {
  if (!copiedUdg) {
    showStatus("Copy a UDG first");
    return;
  }

  udgs[selectedUdg] = cloneGrid(copiedUdg.grid);
  udgColours[selectedUdg] = { ...copiedUdg.colours };
  markProjectChanged();
  refreshAll();
  refreshPaintedCopies(selectedUdg);
  showStatus(
    "Pasted into Bank " + (selectedBank + 1) + " UDG " +
    String.fromCharCode(65 + selectedUdg)
  );
}

document.getElementById("duplicateBank").addEventListener("click", duplicateSelectedBank);
document.getElementById("copyUdg").addEventListener("click", copySelectedUdg);
pasteUdgButton.addEventListener("click", pasteCopiedUdg);

document.getElementById("clearUdg").addEventListener("click", () => {
  replaceSelectedGrid(blankGrid());
});

document.getElementById("invertUdg").addEventListener("click", () => {
  replaceSelectedGrid(
    udgs[selectedUdg].map((row) => row.map((pixel) => pixel ? 0 : 1))
  );
});

document.getElementById("duplicateUdg").addEventListener("click", () => {
  let target = -1;

  for (let offset = 1; offset < UDG_COUNT; offset++) {
    const candidate = (selectedUdg + offset) % UDG_COUNT;
    const isEmpty = udgs[candidate].every((row) =>
      row.every((pixel) => pixel === 0)
    );

    if (isEmpty) {
      target = candidate;
      break;
    }
  }

  if (target === -1) {
    showStatus("No empty UDG slots available");
    return;
  }

  udgs[target] = cloneGrid(udgs[selectedUdg]);
  udgColours[target] = { ...udgColours[selectedUdg] };
  selectedUdg = target;
  markProjectChanged();
  refreshAll();
  refreshPaintedCopies(target);
  showStatus(
    "Duplicated into UDG " + String.fromCharCode(65 + target)
  );
});

document.getElementById("mirrorHorizontal").addEventListener("click", () => {
  replaceSelectedGrid(udgs[selectedUdg].map((row) => row.slice().reverse()));
});

document.getElementById("mirrorVertical").addEventListener("click", () => {
  replaceSelectedGrid(cloneGrid(udgs[selectedUdg]).reverse());
});

document.getElementById("rotateRight").addEventListener("click", () => {
  const source = udgs[selectedUdg];
  const rotated = blankGrid();

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      rotated[col][GRID_SIZE - 1 - row] = source[row][col];
    }
  }

  replaceSelectedGrid(rotated);
});

document.getElementById("rotateLeft").addEventListener("click", () => {
  const source = udgs[selectedUdg];
  const rotated = blankGrid();

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      rotated[GRID_SIZE - 1 - col][row] = source[row][col];
    }
  }

  replaceSelectedGrid(rotated);
});

document.getElementById("shiftUp").addEventListener("click", () => {
  const shifted = blankGrid();
  for (let row = 1; row < GRID_SIZE; row++) shifted[row - 1] = udgs[selectedUdg][row].slice();
  replaceSelectedGrid(shifted);
});

document.getElementById("shiftDown").addEventListener("click", () => {
  const shifted = blankGrid();
  for (let row = 0; row < GRID_SIZE - 1; row++) shifted[row + 1] = udgs[selectedUdg][row].slice();
  replaceSelectedGrid(shifted);
});

document.getElementById("shiftLeft").addEventListener("click", () => {
  const shifted = blankGrid();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 1; col < GRID_SIZE; col++) shifted[row][col - 1] = udgs[selectedUdg][row][col];
  }
  replaceSelectedGrid(shifted);
});

document.getElementById("shiftRight").addEventListener("click", () => {
  const shifted = blankGrid();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE - 1; col++) shifted[row][col + 1] = udgs[selectedUdg][row][col];
  }
  replaceSelectedGrid(shifted);
});

document.getElementById("copyData").addEventListener("click", () => {
  copyText(dataOutput.value, "Selected DATA copied");
});

document.getElementById("copyAllData").addEventListener("click", () => {
  copyText(allDataOutput.value, "All DATA copied");
});

document.getElementById("paintMode").addEventListener("click", () => setScreenMode("paint"));
document.getElementById("rectangleMode").addEventListener("click", () => setScreenMode("rectangle"));
document.getElementById("copyMode").addEventListener("click", () => setScreenMode("copy"));
document.getElementById("pasteMode").addEventListener("click", () => setScreenMode("paste"));
document.getElementById("stampMode").addEventListener("click", () => setScreenMode("stamp"));

document.getElementById("toggleGrid").addEventListener("click", (event) => {
  const off = screen.classList.toggle("grid-off");
  event.currentTarget.textContent = off ? "Grid On" : "Grid Off";
  markProjectChanged();
});

function applyScreenZoom(zoomValue) {
  const pickerWidths = {
    "8": "684px",
    "12": "562px",
    "16": "440px",
    "24": "318px",
    "32": "196px"
  };

  if (zoomValue === "fit") {
    const availableWidth = screenWrap.clientWidth || window.innerWidth;
    const fittedSize = Math.max(
      5,
      Math.min(32, Math.floor((availableWidth - 40) / SCREEN_COLS))
    );

    document.documentElement.style.setProperty(
      "--screen-cell-size",
      fittedSize + "px"
    );
    document.documentElement.style.setProperty(
      "--screen-udg-picker-width",
      pickerWidths["32"]
    );
    return;
  }

  document.documentElement.style.setProperty("--screen-cell-size", zoomValue + "px");
  document.documentElement.style.setProperty(
    "--screen-udg-picker-width",
    pickerWidths[zoomValue] || pickerWidths["16"]
  );
}

document.getElementById("zoom").addEventListener("change", (event) => {
  applyScreenZoom(event.target.value);
  markProjectChanged();
});

window.addEventListener("resize", () => {
  const zoomSelect = document.getElementById("zoom");
  if (zoomSelect.value === "fit") applyScreenZoom("fit");
});

includePokeCheckbox.addEventListener("change", () => {
  refreshDataOutput();
  markProjectChanged();
});

[basicStartLineInput, basicLineIncrementInput].forEach((input) => {
  input.addEventListener("input", () => {
    refreshDataOutput();
    markProjectChanged();
  });
});

projectNameInput.addEventListener("input", markProjectChanged);
foregroundSelect.addEventListener("change", markProjectChanged);
backgroundSelect.addEventListener("change", markProjectChanged);
brightSelect.addEventListener("change", markProjectChanged);
lockPaintColoursCheckbox.addEventListener("change", () => {
  if (!lockPaintColoursCheckbox.checked) applySelectedUdgColours();
  markProjectChanged();
});

udgInkSelect.addEventListener("change", () => {
  udgColours[selectedUdg].ink = udgInkSelect.value;
  markProjectChanged();
  refreshTilePreview();
  refreshScreenUdgPreview(selectedUdg);
});

udgPaperSelect.addEventListener("change", () => {
  udgColours[selectedUdg].paper = udgPaperSelect.value;
  markProjectChanged();
  refreshTilePreview();
  refreshScreenUdgPreview(selectedUdg);
});

udgBrightSelect.addEventListener("change", () => {
  udgColours[selectedUdg].bright = udgBrightSelect.value === "on";
  markProjectChanged();
  refreshTilePreview();
  refreshScreenUdgPreview(selectedUdg);
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isFormField = target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable;

  if (
    helpOverlay.hidden &&
    !isFormField &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  ) {
    const key = event.key.toLowerCase();

    if (key === "c" || key === "v") {
      event.preventDefault();
      if (key === "c") copySelectedUdg();
      else pasteCopiedUdg();
    }
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target;

  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable ||
    event.key.length !== 1
  ) {
    return;
  }

  const index = event.key.toUpperCase().charCodeAt(0) - 65;

  if (event.key >= "1" && event.key <= String(UDG_BANK_COUNT)) {
    event.preventDefault();
    selectBank(Number(event.key) - 1, true);
    return;
  }

  if (index >= 0 && index < UDG_COUNT) {
    event.preventDefault();
    selectUdgForScreen(index);
  }
});

defaultInkSelect.addEventListener("change", () => {
  recordScreenUndo();
  currentScreenObject().defaultInk = defaultInkSelect.value;
  markProjectChanged();
  refreshWholeScreen();
});

defaultPaperSelect.addEventListener("change", () => {
  recordScreenUndo();
  currentScreenObject().defaultPaper = defaultPaperSelect.value;
  markProjectChanged();
  refreshWholeScreen();
});

defaultBrightSelect.addEventListener("change", () => {
  recordScreenUndo();
  currentScreenObject().defaultBright = defaultBrightSelect.value === "on";
  markProjectChanged();
  refreshWholeScreen();
});

document.getElementById("previousScreen").addEventListener("click", () => {
  selectedScreen =
    (selectedScreen - 1 + screens.length) % screens.length;
  refreshScreenControls();
});

document.getElementById("nextScreen").addEventListener("click", () => {
  selectedScreen = (selectedScreen + 1) % screens.length;
  refreshScreenControls();
});

document.getElementById("newScreen").addEventListener("click", () => {
  recordScreenUndo();
  screens.push(createBlankScreen(
    currentScreenObject().defaultInk,
    currentScreenObject().defaultPaper,
    selectedBank,
    currentScreenObject().defaultBright
  ));
  selectedScreen = screens.length - 1;
  markProjectChanged();
  refreshScreenControls();
  showStatus("New screen created");
});

document.getElementById("duplicateScreen").addEventListener("click", () => {
  recordScreenUndo();
  screens.splice(selectedScreen + 1, 0, cloneScreen(currentScreenObject()));
  selectedScreen++;
  markProjectChanged();
  refreshScreenControls();
  showStatus("Screen duplicated");
});

document.getElementById("deleteScreen").addEventListener("click", () => {
  recordScreenUndo();
  if (screens.length === 1) {
    screens[0] = createBlankScreen(
      currentScreenObject().defaultInk,
      currentScreenObject().defaultPaper,
      selectedBank,
      currentScreenObject().defaultBright
    );
    refreshScreenControls();
    markProjectChanged();
    showStatus("Only screen cleared");
    return;
  }

  screens.splice(selectedScreen, 1);
  selectedScreen = Math.min(selectedScreen, screens.length - 1);
  markProjectChanged();
  refreshScreenControls();
  showStatus("Screen deleted");
});

document.getElementById("clearScreen").addEventListener("click", () => {
  recordScreenUndo();
  for (let row = 0; row < SCREEN_ROWS; row++) {
    for (let col = 0; col < SCREEN_COLS; col++) {
      currentScreen()[row][col] = null;
      drawScreenCell(row, col);
    }
  }
  markProjectChanged();
});

undoScreenButton.addEventListener("click", () => {
  if (!screenUndoState) return;
  screenRedoState = captureScreenState();
  const state = screenUndoState;
  screenUndoState = null;
  restoreScreenState(state);
  updateScreenUndoButtons();
  markProjectChanged();
  showStatus("Screen change undone");
});

redoScreenButton.addEventListener("click", () => {
  if (!screenRedoState) return;
  screenUndoState = captureScreenState();
  const state = screenRedoState;
  screenRedoState = null;
  restoreScreenState(state);
  updateScreenUndoButtons();
  markProjectChanged();
  showStatus("Screen change redone");
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable;

  if (isTyping || !(event.ctrlKey || event.metaKey) || event.altKey) return;

  if (event.key.toLowerCase() === "z") {
    event.preventDefault();
    (event.shiftKey ? redoScreenButton : undoScreenButton).click();
  } else if (event.key.toLowerCase() === "y") {
    event.preventDefault();
    redoScreenButton.click();
  }
});



function safeProjectFilename(name) {
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");

  return (cleaned || "spectrum-graphics-project") + ".json";
}

function getProjectData() {
  return {
    format: "zx-spectrum-udg-editor-project",
    version: 5,
    projectName: projectNameInput.value.trim() || "My Spectrum Graphics",
    savedAt: new Date().toISOString(),
    selectedBank,
    selectedUdg,
    udgBanks: udgBanks.map((bank) => bank.map((grid) => cloneGrid(grid))),
    udgColourBanks: udgColourBanks.map((bank) =>
      bank.map((colours) => ({ ...colours }))
    ),
    udgs: udgBanks[0].map((grid) => cloneGrid(grid)),
    udgColours: udgColourBanks[0].map((colours) => ({ ...colours })),
    selectedScreen,
    screens: screens.map((screenObject) => cloneScreen(screenObject)),
    settings: {
      foreground: foregroundSelect.value,
      background: backgroundSelect.value,
      bright: brightSelect.value === "on",
      lockPaintColours: lockPaintColoursCheckbox.checked,
      zoom: document.getElementById("zoom").value,
      gridOff: screen.classList.contains("grid-off"),
      screenMode,
      includePoke: includePokeCheckbox.checked,
      basicStartLine: getBasicLineSetting(basicStartLineInput, 1000),
      basicLineIncrement: getBasicLineSetting(basicLineIncrementInput, 10)
    },
    copiedRegion: copiedRegion
      ? copiedRegion.map((row) => row.map((cell) => cloneCell(cell)))
      : null
  };
}

function saveRecoveryProject() {
  window.clearTimeout(recoveryTimer);
  recoveryTimer = null;

  try {
    localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify({
      dirty: projectHasUnsavedChanges,
      project: getProjectData()
    }));
  } catch (error) {
    // A blocked or full localStorage must not stop normal editing or file saves.
  }
}

function restoreRecoveryProject() {
  try {
    const savedRecovery = localStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!savedRecovery) return false;

    const recovery = JSON.parse(savedRecovery);
    if (!recovery || !recovery.project) return false;

    loadProjectData(recovery.project, {
      dirty: recovery.dirty === true,
      statusMessage: "Recovered your last project"
    });
    return true;
  } catch (error) {
    try {
      localStorage.removeItem(RECOVERY_STORAGE_KEY);
    } catch (storageError) {
      // Ignore storage restrictions and continue with a blank project.
    }
    return false;
  }
}

window.addEventListener("beforeunload", (event) => {
  saveRecoveryProject();
  if (!projectHasUnsavedChanges) return;

  event.preventDefault();
  event.returnValue = "";
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveRecoveryProject();
});

function saveProjectFile() {
  const project = getProjectData();
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = safeProjectFilename(project.projectName);
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  projectHasUnsavedChanges = false;
  saveRecoveryProject();
  showStatus("Project saved");
}

function startNewProject() {
  if (
    projectHasUnsavedChanges &&
    !window.confirm(
      "You have changes that have not been saved to a project file. Start a new project and discard them?"
    )
  ) {
    return;
  }

  const blankBanks = Array.from(
    { length: UDG_BANK_COUNT },
    () => Array.from({ length: UDG_COUNT }, blankGrid)
  );
  const blankColourBanks = Array.from(
    { length: UDG_BANK_COUNT },
    () => Array.from(
      { length: UDG_COUNT },
      () => ({ ink: "White", paper: "Black", bright: true })
    )
  );

  loadProjectData({
    format: "zx-spectrum-udg-editor-project",
    version: 5,
    projectName: "My Spectrum Graphics",
    selectedBank: 0,
    selectedUdg: 0,
    udgBanks: blankBanks,
    udgColourBanks: blankColourBanks,
    screens: [createBlankScreen()],
    selectedScreen: 0,
    settings: {
      foreground: "White",
      background: "Black",
      bright: true,
      lockPaintColours: false,
      zoom: "16",
      gridOff: false,
      screenMode: "paint",
      includePoke: true,
      basicStartLine: 1000,
      basicLineIncrement: 10
    },
    copiedRegion: null
  }, {
    dirty: false,
    statusMessage: "New project started"
  });

  tapNameInput.value = "GRAPHICS";
  refreshTapInstructions();
}

function validateProjectData(project) {
  const savedBanks = Array.isArray(project && project.udgBanks)
    ? project.udgBanks
    : [project && project.udgs];

  if (
    !project ||
    project.format !== "zx-spectrum-udg-editor-project" ||
    !savedBanks.length ||
    savedBanks.length > UDG_BANK_COUNT ||
    (
      !Array.isArray(project.screens) &&
      (!Array.isArray(project.screen) || project.screen.length !== SCREEN_ROWS)
    )
  ) {
    throw new Error("This is not a valid ZX Spectrum UDG Editor project.");
  }

  savedBanks.forEach((bank) => {
    if (!Array.isArray(bank) || bank.length !== UDG_COUNT) {
      throw new Error("The project contains an invalid UDG bank.");
    }

    bank.forEach((grid) => {
      if (!Array.isArray(grid) || grid.length !== GRID_SIZE) {
        throw new Error("The project contains an invalid UDG.");
      }

      grid.forEach((row) => {
        if (!Array.isArray(row) || row.length !== GRID_SIZE) {
          throw new Error("The project contains an invalid UDG row.");
        }
      });
    });
  });

  const savedScreens = Array.isArray(project.screens)
    ? project.screens
    : [{ defaultInk: "White", defaultPaper: "Black", cells: project.screen }];

  if (savedScreens.length < 1) {
    throw new Error("The project does not contain any screens.");
  }

  savedScreens.forEach((screenObject) => {
    if (
      !screenObject ||
      !Array.isArray(screenObject.cells) ||
      screenObject.cells.length !== SCREEN_ROWS
    ) {
      throw new Error("The project contains an invalid screen.");
    }

    screenObject.cells.forEach((row) => {
      if (!Array.isArray(row) || row.length !== SCREEN_COLS) {
        throw new Error("The project contains an invalid screen row.");
      }
    });
  });
}

function loadProjectData(project, options = {}) {
  validateProjectData(project);

  projectNameInput.value =
    typeof project.projectName === "string" && project.projectName.trim()
      ? project.projectName
      : "My Spectrum Graphics";

  const savedBanks = Array.isArray(project.udgBanks)
    ? project.udgBanks
    : [project.udgs];
  const savedColourBanks = Array.isArray(project.udgColourBanks)
    ? project.udgColourBanks
    : [project.udgColours];

  for (let bank = 0; bank < UDG_BANK_COUNT; bank++) {
    for (let index = 0; index < UDG_COUNT; index++) {
      const savedGrid = savedBanks[bank] && savedBanks[bank][index];
      udgBanks[bank][index] = savedGrid
        ? savedGrid.map((row) => row.map((pixel) => pixel ? 1 : 0))
        : blankGrid();

      const savedColours = savedColourBanks[bank]
        ? savedColourBanks[bank][index]
        : null;

      udgColourBanks[bank][index] = {
        ink: savedColours && spectrumColours[savedColours.ink]
          ? savedColours.ink
          : "White",
        paper: savedColours && spectrumColours[savedColours.paper]
          ? savedColours.paper
          : "Black",
        bright: !savedColours || savedColours.bright !== false
      };
    }
  }

  const savedScreens = Array.isArray(project.screens)
    ? project.screens
    : [{ defaultInk: "White", defaultPaper: "Black", cells: project.screen }];

  screens.length = 0;

  savedScreens.forEach((savedScreen) => {
    const loadedScreen = createBlankScreen(
      spectrumColours[savedScreen.defaultInk] ? savedScreen.defaultInk : "White",
      spectrumColours[savedScreen.defaultPaper] ? savedScreen.defaultPaper : "Black",
      Number.isInteger(savedScreen.activeBank)
        ? Math.max(0, Math.min(UDG_BANK_COUNT - 1, savedScreen.activeBank))
        : 0,
      savedScreen.defaultBright !== false
    );

    for (let row = 0; row < SCREEN_ROWS; row++) {
      for (let col = 0; col < SCREEN_COLS; col++) {
        const cell = savedScreen.cells[row][col];

        if (
          cell === null ||
          typeof cell !== "object" ||
          !Number.isInteger(cell.udg) ||
          cell.udg < 0 ||
          cell.udg >= UDG_COUNT
        ) {
          loadedScreen.cells[row][col] = null;
        } else {
          loadedScreen.cells[row][col] = {
            bank: Number.isInteger(cell.bank)
              ? Math.max(0, Math.min(UDG_BANK_COUNT - 1, cell.bank))
              : 0,
            udg: cell.udg,
            foreground: spectrumColours[cell.foreground]
              ? cell.foreground
              : "White",
            background: spectrumColours[cell.background]
              ? cell.background
              : "Black",
            bright: cell.bright !== false
          };
        }
      }
    }

    screens.push(loadedScreen);
  });

  selectedScreen = Number.isInteger(project.selectedScreen)
    ? Math.max(0, Math.min(screens.length - 1, project.selectedScreen))
    : 0;

  selectedUdg = Number.isInteger(project.selectedUdg)
    ? Math.max(0, Math.min(UDG_COUNT - 1, project.selectedUdg))
    : 0;

  selectedBank = Number.isInteger(project.selectedBank)
    ? Math.max(0, Math.min(UDG_BANK_COUNT - 1, project.selectedBank))
    : screens[selectedScreen].activeBank;
  udgs = udgBanks[selectedBank];
  udgColours = udgColourBanks[selectedBank];

  const settings = project.settings || {};

  foregroundSelect.value = spectrumColours[settings.foreground]
    ? settings.foreground
    : "White";

  backgroundSelect.value = spectrumColours[settings.background]
    ? settings.background
    : "Black";

  brightSelect.value = settings.bright !== false ? "on" : "off";
  lockPaintColoursCheckbox.checked = settings.lockPaintColours === true;

  const zoomValue = ["fit", "8", "12", "16", "24", "32"].includes(String(settings.zoom))
    ? String(settings.zoom)
    : "16";

  document.getElementById("zoom").value = zoomValue;
  applyScreenZoom(zoomValue);

  screen.classList.toggle("grid-off", Boolean(settings.gridOff));
  document.getElementById("toggleGrid").textContent =
    settings.gridOff ? "Grid On" : "Grid Off";

  includePokeCheckbox.checked = settings.includePoke !== false;
  basicStartLineInput.value = getBasicLineSetting(
    { value: settings.basicStartLine },
    1000
  );
  basicLineIncrementInput.value = getBasicLineSetting(
    { value: settings.basicLineIncrement },
    10
  );

  const validModes = ["paint", "rectangle", "copy", "paste", "stamp"];
  setScreenMode(validModes.includes(settings.screenMode) ? settings.screenMode : "paint");

  copiedRegion = Array.isArray(project.copiedRegion)
    ? project.copiedRegion.map((row) =>
        Array.isArray(row) ? row.map((cell) => cloneCell(cell)) : []
      )
    : null;

  copiedUdg = null;
  pasteUdgButton.disabled = true;

  screenUndoState = null;
  screenRedoState = null;
  projectHasUnsavedChanges = options.dirty === true;
  updateScreenUndoButtons();

  refreshAll();
  refreshScreenControls();
  saveRecoveryProject();
  showStatus(options.statusMessage || "Project loaded");
}

function openProjectFile(file) {
  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.addEventListener("load", () => {
    try {
      const project = JSON.parse(String(reader.result));
      loadProjectData(project);
    } catch (error) {
      window.alert(error.message || "The project file could not be loaded.");
    } finally {
      projectFileInput.value = "";
    }
  });

  reader.addEventListener("error", () => {
    window.alert("The project file could not be read.");
    projectFileInput.value = "";
  });

  reader.readAsText(file);
}


const TAP_LOAD_ADDRESS = 50000;
const TAP_CONTROL_ADDRESS = TAP_LOAD_ADDRESS;
const TAP_RENDERER_OFFSET = 16;
const TAP_RENDERER_ADDRESS = TAP_LOAD_ADDRESS + TAP_RENDERER_OFFSET;

const spectrumColourNumbers = {
  Black: 0,
  Blue: 1,
  Red: 2,
  Magenta: 3,
  Green: 4,
  Cyan: 5,
  Yellow: 6,
  White: 7
};

function littleEndianWord(value) {
  return [value & 255, (value >> 8) & 255];
}

function xorChecksum(bytes) {
  return bytes.reduce((value, byte) => value ^ byte, 0);
}

function tapeBlock(payload) {
  const length = payload.length;
  return [...littleEndianWord(length), ...payload];
}

function spectrumTapeName(name) {
  const cleaned = (name || "GRAPHICS")
    .toUpperCase()
    .replace(/[^A-Z0-9 _-]/g, "")
    .slice(0, 10)
    .padEnd(10, " ");

  return Array.from(cleaned, (character) => character.charCodeAt(0));
}

function makeTapeHeader(type, name, length, parameter1, parameter2) {
  const body = [
    0,
    type,
    ...spectrumTapeName(name),
    ...littleEndianWord(length),
    ...littleEndianWord(parameter1),
    ...littleEndianWord(parameter2)
  ];

  return tapeBlock([...body, xorChecksum(body)]);
}

function makeTapeData(data) {
  const body = [255, ...data];
  return tapeBlock([...body, xorChecksum(body)]);
}

function spectrumInteger(value) {
  return [
    ...Array.from(String(value), (character) => character.charCodeAt(0)),
    14, 0, 0, value & 255, (value >> 8) & 255, 0
  ];
}

function basicLine(number, bytes) {
  const content = [...bytes, 13];
  return [
    (number >> 8) & 255,
    number & 255,
    ...littleEndianWord(content.length),
    ...content
  ];
}

function buildBasicLoader(codeLength, screenCount) {
  const SPACE = 32;
  const QUOTE = 34;

  const lines = [
    basicLine(10, [253, SPACE, ...spectrumInteger(TAP_LOAD_ADDRESS - 1)]),
    basicLine(20, [
      239, SPACE, QUOTE, QUOTE, SPACE, 175, SPACE,
      ...spectrumInteger(TAP_LOAD_ADDRESS)
    ]),
    basicLine(30, [
      235, SPACE, 97, 61, ...spectrumInteger(0),
      32, 204, 32, ...spectrumInteger(screenCount - 1)
    ]),
    basicLine(40, [
      244, SPACE,
      ...spectrumInteger(TAP_CONTROL_ADDRESS),
      44,
      97
    ]),
    basicLine(50, [
      249, SPACE, 192, SPACE,
      ...spectrumInteger(TAP_RENDERER_ADDRESS)
    ]),
    basicLine(60,[242,32,...spectrumInteger(0)]),
    basicLine(70,[243,32,97])
  ];

  return lines.flat();
}

function createAssembler() {
  const bytes = [];
  const labels = new Map();
  const absoluteFixups = [];
  const relativeFixups = [];

  return {
    emit(...values) {
      values.forEach((value) => bytes.push(value & 255));
    },

    word(value) {
      bytes.push(value & 255, (value >> 8) & 255);
    },

    label(name) {
      labels.set(name, bytes.length);
    },

    absolute(opcode, label) {
      bytes.push(opcode, 0, 0);
      absoluteFixups.push({ offset: bytes.length - 2, label });
    },

    relative(opcode, label) {
      bytes.push(opcode, 0);
      relativeFixups.push({ offset: bytes.length - 1, label });
    },

    finish(origin) {
      absoluteFixups.forEach((fixup) => {
        if (!labels.has(fixup.label)) {
          throw new Error("Missing assembler label: " + fixup.label);
        }

        const address = origin + labels.get(fixup.label);
        bytes[fixup.offset] = address & 255;
        bytes[fixup.offset + 1] = (address >> 8) & 255;
      });

      relativeFixups.forEach((fixup) => {
        if (!labels.has(fixup.label)) {
          throw new Error("Missing assembler label: " + fixup.label);
        }

        const displacement = labels.get(fixup.label) - (fixup.offset + 1);

        if (displacement < -128 || displacement > 127) {
          throw new Error("Relative jump is out of range.");
        }

        bytes[fixup.offset] = displacement & 255;
      });

      return bytes;
    },

    get length() {
      return bytes.length;
    }
  };
}

function buildRenderer(
  tileDataAddress,
  bankMapAddress,
  directoryAddress,
  screenDataAddress,
  screenCount
) {
  const asm = createAssembler();

  // Find selected screen through its two-byte directory offset.
  asm.emit(0x3A); asm.word(TAP_CONTROL_ADDRESS); // LD A,(control)
  asm.emit(0xFE, screenCount);                    // CP screenCount
  asm.emit(0xD0);                                 // RET NC
  asm.emit(0x6F);                                 // LD L,A
  asm.emit(0x26, 0);                              // LD H,0
  asm.emit(0x29);                                 // ADD HL,HL
  asm.emit(0x11); asm.word(directoryAddress);     // LD DE,directory
  asm.emit(0x19);                                 // ADD HL,DE
  asm.emit(0x5E);                                 // LD E,(HL)
  asm.emit(0x23);                                 // INC HL
  asm.emit(0x56);                                 // LD D,(HL)
  asm.emit(0x21); asm.word(screenDataAddress);    // LD HL,data
  asm.emit(0x19);                                 // ADD HL,DE

  // Read the default attribute and preferred BASIC UDG bank.
  asm.emit(0x7E);                                 // LD A,(HL)
  asm.emit(0x23);                                 // INC HL
  asm.emit(0xF5);                                 // PUSH AF
  asm.emit(0x7E);                                 // LD A,(HL) bank
  asm.emit(0x23);                                 // INC HL
  asm.emit(0xE5);                                 // PUSH HL (stream)

  // Find this bank's 21-byte packed-tile lookup table.
  asm.emit(0x21); asm.word(bankMapAddress);        // LD HL,bank map
  asm.emit(0xB7);                                 // OR A
  asm.relative(0x28, "installBank");               // JR Z,installBank
  asm.emit(0x11); asm.word(UDG_COUNT);             // LD DE,21
  asm.label("findBank");
  asm.emit(0x19);                                 // ADD HL,DE
  asm.emit(0x3D);                                 // DEC A
  asm.relative(0x20, "findBank");                  // JR NZ,findBank

  asm.label("installBank");
  asm.emit(0xE5);                                 // PUSH HL (bank map)

  // Clear all 21 BASIC UDG slots before installing non-blank definitions.
  asm.emit(0xAF);                                 // XOR A
  asm.emit(0x21); asm.word(65368);                 // LD HL,USR "A"
  asm.emit(0x11); asm.word(65369);                 // LD DE,USR "A"+1
  asm.emit(0x01); asm.word(UDG_COUNT * 8 - 1);     // LD BC,167
  asm.emit(0x77);                                 // LD (HL),A
  asm.emit(0xED, 0xB0);                           // LDIR
  asm.emit(0xE1);                                 // POP HL (bank map)

  asm.emit(0x11); asm.word(65368);                 // LD DE,UDG destination
  asm.emit(0x06, UDG_COUNT);                       // LD B,21 slots
  asm.label("installSlot");
  asm.emit(0x7E);                                 // LD A,(HL) packed tile
  asm.emit(0x23);                                 // INC HL
  asm.emit(0xFE, 255);                            // CP 255
  asm.relative(0x28, "skipInstallSlot");           // JR Z,skip slot

  asm.emit(0xE5, 0xC5);                           // PUSH HL,BC
  asm.emit(0x6F);                                 // LD L,A
  asm.emit(0x26, 0);                              // LD H,0
  asm.emit(0x29, 0x29, 0x29);                     // ADD HL,HL x3
  asm.emit(0x01); asm.word(tileDataAddress);       // LD BC,tile data
  asm.emit(0x09);                                 // ADD HL,BC
  asm.emit(0x06, 8);                              // LD B,8
  asm.label("copyInstallRows");
  asm.emit(0x7E);                                 // LD A,(HL)
  asm.emit(0x12);                                 // LD (DE),A
  asm.emit(0x23, 0x13);                           // INC HL / INC DE
  asm.relative(0x10, "copyInstallRows");           // DJNZ copy rows
  asm.emit(0xC1, 0xE1);                           // POP BC,HL
  asm.relative(0x18, "nextInstallSlot");           // JR next slot

  asm.label("skipInstallSlot");
  asm.emit(0xE5);                                 // PUSH HL
  asm.emit(0x21); asm.word(8);                    // LD HL,8
  asm.emit(0x19);                                 // ADD HL,DE
  asm.emit(0xEB);                                 // EX DE,HL
  asm.emit(0xE1);                                 // POP HL

  asm.label("nextInstallSlot");
  asm.relative(0x10, "installSlot");               // DJNZ installSlot
  asm.emit(0xE1);                                 // POP HL (stream)
  asm.emit(0xF1);                                 // POP AF (attribute)

  // Preserve the stream and attribute while clearing the screen.
  asm.emit(0xE5);                                 // PUSH HL
  asm.emit(0xF5);                                 // PUSH AF

  asm.emit(0xAF);                                 // XOR A
  asm.emit(0x21); asm.word(16384);                // LD HL,16384
  asm.emit(0x11); asm.word(16385);                // LD DE,16385
  asm.emit(0x01); asm.word(6143);                 // LD BC,6143
  asm.emit(0x77);                                 // LD (HL),A
  asm.emit(0xED, 0xB0);                           // LDIR

  asm.emit(0xF1);                                 // POP AF
  asm.emit(0x21); asm.word(22528);                // LD HL,22528
  asm.emit(0x11); asm.word(22529);                // LD DE,22529
  asm.emit(0x01); asm.word(767);                  // LD BC,767
  asm.emit(0x77);                                 // LD (HL),A
  asm.emit(0xED, 0xB0);                           // LDIR

  asm.emit(0xE1);                                 // POP HL (stream)
  asm.emit(0x11, 0, 0);                           // LD DE,0 (cell position)

  asm.label("record");
  asm.emit(0x4E);                                 // LD C,(HL)
  asm.emit(0x23);                                 // INC HL
  asm.emit(0x46);                                 // LD B,(HL)
  asm.emit(0x23);                                 // INC HL
  asm.emit(0x78);                                 // LD A,B
  asm.emit(0xA1);                                 // AND C
  asm.emit(0xFE, 255);                            // CP 255
  asm.emit(0xC8);                                 // RET Z

  asm.emit(0xE5);                                 // PUSH HL
  asm.emit(0xEB);                                 // EX DE,HL
  asm.emit(0x09);                                 // ADD HL,BC
  asm.emit(0xEB);                                 // EX DE,HL
  asm.emit(0xE1);                                 // POP HL
  asm.emit(0x7E);                                 // LD A,(HL)
  asm.emit(0x23);                                 // INC HL
  asm.emit(0x47);                                 // LD B,A

  asm.label("tileLoop");
  asm.emit(0x4E);                                 // LD C,(HL) tile
  asm.emit(0x23);                                 // INC HL
  asm.emit(0x7E);                                 // LD A,(HL) attr
  asm.emit(0x23);                                 // INC HL
  asm.emit(0xE5, 0xC5, 0xD5);                     // PUSH HL,BC,DE
  asm.absolute(0xCD, "drawCell");                  // CALL drawCell
  asm.emit(0xD1, 0xC1, 0xE1);                     // POP DE,BC,HL
  asm.emit(0x13);                                 // INC DE
  asm.relative(0x10, "tileLoop");                  // DJNZ tileLoop
  asm.absolute(0xC3, "record");                    // JP record

  asm.label("drawCell");
  // Attribute address = 22528 + cell position.
  asm.emit(0x21); asm.word(22528);                // LD HL,22528
  asm.emit(0x19);                                 // ADD HL,DE
  asm.emit(0x77);                                 // LD (HL),A

  // Tile 255 is a deliberately blank tile: keep its attribute,
  // but leave the bitmap cleared.
  asm.emit(0x79);                                 // LD A,C
  asm.emit(0xFE, 255);                            // CP 255
  asm.emit(0xC8);                                 // RET Z

  // x = position & 31.
  asm.emit(0x7B);                                 // LD A,E
  asm.emit(0xE6, 31);                             // AND 31
  asm.emit(0x47);                                 // LD B,A

  // y = position >> 5.
  asm.emit(0x62, 0x6B);                           // LD H,D / LD L,E
  for (let i = 0; i < 5; i++) {
    asm.emit(0xCB, 0x3C, 0xCB, 0x1D);             // SRL H / RR L
  }

  // Spectrum bitmap address for character cell x,y:
  // 16384 + ((y AND 24) * 256) + ((y AND 7) * 32) + x.
  // The bitmap is split into three interleaved 8-row sections.
  asm.emit(0x7D);                                 // LD A,L
  asm.emit(0xE6, 24);                             // AND 24
  asm.emit(0xC6, 64);                             // ADD A,64
  asm.emit(0x57);                                 // LD D,A

  asm.emit(0x7D);                                 // LD A,L
  asm.emit(0xE6, 7);                              // AND 7
  asm.emit(0x07, 0x07, 0x07, 0x07, 0x07);        // RLCA x5 (*32)
  asm.emit(0x80);                                 // ADD A,B (x)
  asm.emit(0x5F);                                 // LD E,A

  // Source UDG = tileDataAddress + packed tile*8.
  asm.emit(0x69);                                 // LD L,C
  asm.emit(0x26, 0);                              // LD H,0
  asm.emit(0x29, 0x29, 0x29);                     // ADD HL,HL x3
  asm.emit(0x01); asm.word(tileDataAddress);      // LD BC,tile data
  asm.emit(0x09);                                 // ADD HL,BC
  asm.emit(0x06, 8);                              // LD B,8

  asm.label("copyRows");
  asm.emit(0x7E);                                 // LD A,(HL)
  asm.emit(0x12);                                 // LD (DE),A
  asm.emit(0x23);                                 // INC HL
  asm.emit(0x14);                                 // INC D
  asm.relative(0x10, "copyRows");                  // DJNZ copyRows
  asm.emit(0xC9);                                 // RET

  return asm.finish(TAP_RENDERER_ADDRESS);
}

function colourAttribute(ink, paper, bright = true) {
  return (
    spectrumColourNumbers[ink] +
    spectrumColourNumbers[paper] * 8 +
    (bright ? 64 : 0)
  );
}

function compressScreenForTap(screenObject, packedTileMap) {
  const output = [
    colourAttribute(
      screenObject.defaultInk,
      screenObject.defaultPaper,
      screenObject.defaultBright
    ),
    screenObject.activeBank
  ];

  let position = 0;
  let index = 0;

  while (index < SCREEN_ROWS * SCREEN_COLS) {
    while (
      index < SCREEN_ROWS * SCREEN_COLS &&
      screenObject.cells[Math.floor(index / SCREEN_COLS)][index % SCREEN_COLS] === null
    ) {
      index++;
    }

    if (index >= SCREEN_ROWS * SCREEN_COLS) {
      break;
    }

    const start = index;
    const run = [];

    while (
      index < SCREEN_ROWS * SCREEN_COLS &&
      run.length < 255
    ) {
      const cell =
        screenObject.cells[Math.floor(index / SCREEN_COLS)][index % SCREEN_COLS];

      if (cell === null) {
        break;
      }

      run.push(cell);
      index++;
    }

    const skip = start - position;
    output.push(...littleEndianWord(skip), run.length);

    run.forEach((cell) => {
      const bank = Number.isInteger(cell.bank) ? cell.bank : 0;
      const tile = packedTileMap[bank + ":" + cell.udg];

      output.push(
        tile === undefined ? 255 : tile,
        colourAttribute(cell.foreground, cell.background, cell.bright !== false)
      );
    });

    position = start + run.length;
  }

  output.push(255, 255);
  return output;
}

function buildPackedUdgSet() {
  const packedTileMap = {};
  const packedUdgBytes = [];
  const bankMaps = Array.from(
    { length: UDG_BANK_COUNT },
    () => Array(UDG_COUNT).fill(255)
  );
  let exportedUdgCount = 0;

  udgBanks.forEach((bank, bankIndex) => {
    bank.forEach((grid, udgIndex) => {
      const bytes = getGridBytes(grid);

      if (bytes.every((byte) => byte === 0)) {
        return;
      }

      const packedIndex = exportedUdgCount++;
      packedTileMap[bankIndex + ":" + udgIndex] = packedIndex;
      bankMaps[bankIndex][udgIndex] = packedIndex;
      packedUdgBytes.push(...bytes);
    });
  });

  return {
    packedTileMap,
    packedUdgBytes,
    bankMapBytes: bankMaps.flat(),
    exportedUdgCount
  };
}

function buildGraphicsPackage() {
  const packedUdgs = buildPackedUdgSet();
  const compressedScreens = screens.map((screenObject) =>
    compressScreenForTap(screenObject, packedUdgs.packedTileMap)
  );
  const directoryLength = screens.length * 2;

  // First build gets the renderer's fixed size.
  const placeholderRenderer = buildRenderer(
    0,
    0,
    0,
    0,
    screens.length
  );
  const tileDataOffset = TAP_RENDERER_OFFSET + placeholderRenderer.length;
  const bankMapOffset = tileDataOffset + packedUdgs.packedUdgBytes.length;
  const directoryOffset = bankMapOffset + packedUdgs.bankMapBytes.length;
  const dataOffset = directoryOffset + directoryLength;

  const tileDataAddress = TAP_LOAD_ADDRESS + tileDataOffset;
  const bankMapAddress = TAP_LOAD_ADDRESS + bankMapOffset;
  const directoryAddress = TAP_LOAD_ADDRESS + directoryOffset;
  const screenDataAddress = TAP_LOAD_ADDRESS + dataOffset;

  const renderer = buildRenderer(
    tileDataAddress,
    bankMapAddress,
    directoryAddress,
    screenDataAddress,
    screens.length
  );

  const directory = [];
  let runningOffset = 0;

  compressedScreens.forEach((screenBytes) => {
    directory.push(...littleEndianWord(runningOffset));
    runningOffset += screenBytes.length;
  });

  const header = Array(TAP_RENDERER_OFFSET).fill(0);
  header[0] = 0; // Requested screen, zero based.
  header[1] = 90; // Z
  header[2] = 88; // X
  header[3] = 71; // G
  header[4] = 2;  // Package version.
  header[5] = screens.length;
  header[6] = UDG_BANK_COUNT;

  const packageBytes = [
    ...header,
    ...renderer,
    ...packedUdgs.packedUdgBytes,
    ...packedUdgs.bankMapBytes,
    ...directory,
    ...compressedScreens.flat()
  ];

  if (TAP_LOAD_ADDRESS + packageBytes.length > 65535) {
    throw new Error(
      "The graphics package is too large for address " +
      TAP_LOAD_ADDRESS +
      ". Remove screens or simplify them."
    );
  }

  return {
    packageBytes,
    exportedUdgCount: packedUdgs.exportedUdgCount,
    removedBlankUdgCount:
      UDG_BANK_COUNT * UDG_COUNT - packedUdgs.exportedUdgCount,
    bankCount: UDG_BANK_COUNT
  };
}

function buildTapFile() {
  const graphicsPackage = buildGraphicsPackage();
  const packageBytes = graphicsPackage.packageBytes;
  const basicBytes = buildBasicLoader(packageBytes.length, screens.length);
  const name = tapNameInput.value.trim() || "GRAPHICS";

  return {
    bytes: [
      ...makeTapeHeader(0, name, basicBytes.length, 10, basicBytes.length),
      ...makeTapeData(basicBytes),
      ...makeTapeHeader(
        3,
        name,
        packageBytes.length,
        TAP_LOAD_ADDRESS,
        32768
      ),
      ...makeTapeData(packageBytes)
    ],
    packageLength: packageBytes.length,
    basicLength: basicBytes.length,
    exportedUdgCount: graphicsPackage.exportedUdgCount,
    removedBlankUdgCount: graphicsPackage.removedBlankUdgCount,
    bankCount: graphicsPackage.bankCount,
    name
  };
}

function refreshTapInstructions() {
  tapInstructions.value =
    "The exported TAP auto-loads and draws screen 1.\n\n" +
    "To draw another screen from your own BASIC:\n\n" +
    "LET s=2\n" +
    "POKE " + TAP_CONTROL_ADDRESS + ",s-1\n" +
    "RANDOMIZE USR " + TAP_RENDERER_ADDRESS + "\n\n" +
    "Package load address: " + TAP_LOAD_ADDRESS + "\n" +
    "Required CLEAR: " + (TAP_LOAD_ADDRESS - 1) + "\n" +
    "Renderer entry: " + TAP_RENDERER_ADDRESS;
}

function exportTapFile() {
  try {
    const tap = buildTapFile();
    const blob = new Blob(
      [new Uint8Array(tap.bytes)],
      { type: "application/octet-stream" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    const tapFilename = (tap.name || "GRAPHICS")
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "") || "GRAPHICS";

    link.download = tapFilename.replace(/\.tap$/i, "") + ".tap";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    tapStatus.textContent =
      tapFilename + ".tap built: " +
      tap.packageLength +
      " byte graphics package, " +
      screens.length +
      " screen" +
      (screens.length === 1 ? "" : "s") +
      ", " +
      tap.exportedUdgCount +
      " UDG" +
      (tap.exportedUdgCount === 1 ? "" : "s") +
      " across " +
      tap.bankCount +
      " banks; " +
      tap.removedBlankUdgCount +
      " blank slots omitted.";
  } catch (error) {
    tapStatus.textContent = error.message || "The TAP could not be built.";
  }
}

function setPanelCollapsed(panel, isCollapsed) {
  const button = panel.querySelector(".panel-toggle");
  const content = panel.querySelector(".panel-content");
  const panelName = panel.dataset.panelName || "Panel";

  panel.classList.toggle("collapsed", isCollapsed);
  content.hidden = isCollapsed;
  button.textContent = isCollapsed ? "+" : "−";
  button.setAttribute("aria-expanded", String(!isCollapsed));
  button.title = isCollapsed
    ? "Expand " + panelName
    : "Collapse " + panelName;
}

function buildCollapsiblePanels() {
  document.querySelectorAll(".collapsible-panel").forEach((panel) => {
    const button = panel.querySelector(".panel-toggle");

    button.addEventListener("click", () => {
      setPanelCollapsed(panel, !panel.classList.contains("collapsed"));
    });
  });
}

let compactUiState = null;

function configureResponsiveUi() {
  const hasTouch = navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches;
  const isCompact = window.matchMedia("(max-width: 760px)").matches;

  document.body.classList.toggle("touch-ui", hasTouch);

  if (compactUiState === isCompact) return;
  compactUiState = isCompact;

  document.querySelectorAll(".mobile-details").forEach((details) => {
    details.open = !isCompact;
  });

  if (isCompact) {
    const tapPanel = document.querySelector('[data-panel-name="TAP Export"]');
    if (tapPanel) setPanelCollapsed(tapPanel, true);
  }
}

function setCloudStatus(message, isError = false) {
  cloudStatus.textContent = message;
  cloudStatus.classList.toggle("error", isError);
}

async function cloudApi(action, options = {}) {
  const query = new URLSearchParams({ action });
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => query.set(key, value));
  }

  const request = {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json"
    }
  };

  if (options.body !== undefined) {
    request.headers["Content-Type"] = "application/json";
    if (cloudConfig && cloudConfig.csrf) {
      request.headers["X-CSRF-Token"] = cloudConfig.csrf;
    }
    request.body = JSON.stringify(options.body);
  }

  const response = await fetch("api/index.php?" + query.toString(), request);
  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("The cloud service returned an unreadable response.");
  }

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "The cloud request failed.");
  }

  return payload;
}

function formatCloudBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatCloudDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function makeCloudButton(label, handler, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (options.className) button.className = options.className;
  if (options.disabled) button.disabled = true;
  button.addEventListener("click", handler);
  return button;
}

function qaopUrl(tapUrl) {
  return "https://torinak.com/qaop/#l=" + tapUrl;
}

function makeCloudLink(label, href) {
  const link = document.createElement("a");
  link.className = "button-link";
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = label;
  return link;
}

function updateCloudAccountUi() {
  const signedIn = cloudUser !== null;
  cloudSignedOut.hidden = signedIn;
  cloudSignedIn.hidden = !signedIn;

  if (!signedIn) return;

  cloudUserName.textContent = cloudUser.name;
  cloudUserEmail.textContent = cloudUser.email;
  if (cloudUser.picture) {
    cloudUserPicture.src = cloudUser.picture;
    cloudUserPicture.hidden = false;
  } else {
    cloudUserPicture.removeAttribute("src");
    cloudUserPicture.hidden = true;
  }
  openCloudAdminButton.hidden = cloudUser.role !== "admin";
  cloudUpdateButton.disabled = currentCloudProjectId === null;
  cloudProjectNameInput.value =
    cloudProjectNameInput.value || projectNameInput.value.trim() || "My Spectrum Graphics";
}

function renderCloudProjects() {
  cloudProjectList.replaceChildren();

  if (!cloudProjects.length) {
    const empty = document.createElement("div");
    empty.className = "empty-cloud-message";
    empty.textContent = "No cloud projects yet. Save this one as your first.";
    cloudProjectList.appendChild(empty);
    return;
  }

  cloudProjects.forEach((project) => {
    const card = document.createElement("article");
    card.className = "cloud-project-card";
    if (project.id === currentCloudProjectId) card.classList.add("current");

    const header = document.createElement("div");
    header.className = "cloud-project-card-header";
    const heading = document.createElement("h4");
    heading.textContent = project.name;
    const badge = document.createElement("strong");
    badge.textContent = project.published ? "Published" : "Private";
    header.append(heading, badge);

    const meta = document.createElement("p");
    meta.className = "cloud-project-meta";
    meta.textContent =
      "Updated " + formatCloudDate(project.updatedAt) +
      " · " + formatCloudBytes(project.projectBytes + project.tapBytes);

    const actions = document.createElement("div");
    actions.className = "button-row";
    actions.appendChild(makeCloudButton("Open", () => loadCloudProject(project.id)));

    if (project.id === currentCloudProjectId) {
      actions.appendChild(makeCloudButton("Save", () => saveCloudProject(project.id)));
      actions.appendChild(
        makeCloudButton(
          project.published ? "Update TAP" : "Publish TAP",
          () => publishCloudProject(project.id)
        )
      );
    }

    if (project.published) {
      actions.appendChild(
        makeCloudButton(
          "Copy Project Link",
          () => copyCloudLink(project.shareUrl, "Project link copied")
        )
      );
      actions.appendChild(
        makeCloudButton(
          "Copy TAP Link",
          () => copyCloudLink(project.tapUrl, "TAP link copied")
        )
      );
      actions.appendChild(makeCloudLink("Download TAP", project.tapUrl));
      actions.appendChild(makeCloudLink("Try in QAOP", qaopUrl(project.tapUrl)));
      actions.appendChild(makeCloudButton("Unpublish", () => unpublishCloudProject(project.id)));
    }

    actions.appendChild(makeCloudButton("Delete", () => deleteCloudProject(project)));
    card.append(header, meta, actions);
    cloudProjectList.appendChild(card);
  });
}

async function refreshCloudProjects() {
  if (!cloudUser) return;
  try {
    const response = await cloudApi("projects");
    cloudProjects = response.projects;
    renderCloudProjects();
  } catch (error) {
    setCloudStatus(error.message, true);
  }
}

async function saveCloudProject(projectId = null, quiet = false) {
  if (!cloudUser) {
    setCloudStatus("Sign in before saving to the cloud.", true);
    return null;
  }

  const name = cloudProjectNameInput.value.trim() ||
    projectNameInput.value.trim() ||
    "My Spectrum Graphics";
  setCloudStatus(projectId ? "Updating cloud project…" : "Saving new cloud project…");

  try {
    const response = await cloudApi("save-project", {
      method: "POST",
      body: {
        id: projectId,
        name,
        project: getProjectData()
      }
    });
    currentCloudProjectId = response.project.id;
    projectNameInput.value = response.project.name;
    cloudProjectNameInput.value = response.project.name;
    projectHasUnsavedChanges = false;
    saveRecoveryProject();
    cloudUpdateButton.disabled = false;
    await refreshCloudProjects();
    if (!quiet) setCloudStatus("Cloud project saved");
    return response.project;
  } catch (error) {
    setCloudStatus(error.message, true);
    return null;
  }
}

async function loadCloudProject(projectId) {
  if (
    projectHasUnsavedChanges &&
    !window.confirm("Open this cloud project and replace your current unsaved changes?")
  ) {
    return;
  }

  setCloudStatus("Opening cloud project…");
  try {
    const response = await cloudApi("load-project", {
      query: { id: projectId }
    });
    loadProjectData(response.project, {
      dirty: false,
      statusMessage: "Cloud project loaded"
    });
    currentCloudProjectId = response.meta.id;
    cloudProjectNameInput.value = response.meta.name;
    cloudUpdateButton.disabled = false;
    renderCloudProjects();
    setCloudStatus("Cloud project opened");
    closeCloud();
  } catch (error) {
    setCloudStatus(error.message, true);
  }
}

function tapBytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 8192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function publishCloudProject(projectId) {
  if (projectId !== currentCloudProjectId) {
    setCloudStatus("Open the project before publishing it.", true);
    return;
  }

  const saved = await saveCloudProject(projectId, true);
  if (!saved) return;

  setCloudStatus("Building and publishing TAP…");
  try {
    const tap = buildTapFile();
    const response = await cloudApi("publish-project", {
      method: "POST",
      body: {
        id: projectId,
        tap: tapBytesToBase64(tap.bytes)
      }
    });
    await refreshCloudProjects();
    setCloudStatus("Published. The share and TAP links are ready.");
    await copyCloudLink(response.project.tapUrl, false);
  } catch (error) {
    setCloudStatus(error.message, true);
  }
}

async function unpublishCloudProject(projectId) {
  if (!window.confirm("Remove the public project and TAP links? Your private cloud save will remain.")) {
    return;
  }
  try {
    await cloudApi("unpublish-project", {
      method: "POST",
      body: { id: projectId }
    });
    await refreshCloudProjects();
    setCloudStatus("Project is private again");
  } catch (error) {
    setCloudStatus(error.message, true);
  }
}

async function deleteCloudProject(project) {
  if (!window.confirm('Delete the cloud project "' + project.name + '"? This cannot be undone.')) {
    return;
  }
  try {
    await cloudApi("delete-project", {
      method: "POST",
      body: { id: project.id }
    });
    if (currentCloudProjectId === project.id) {
      currentCloudProjectId = null;
      cloudUpdateButton.disabled = true;
    }
    await refreshCloudProjects();
    setCloudStatus("Cloud project deleted");
  } catch (error) {
    setCloudStatus(error.message, true);
  }
}

async function copyCloudLink(url, message = "Link copied") {
  try {
    await navigator.clipboard.writeText(url);
    if (message) setCloudStatus(message);
  } catch (error) {
    window.prompt("Copy this link:", url);
  }
}

function loadGoogleIdentityScript() {
  if (window.google && window.google.accounts) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error("Google sign-in could not be loaded.")), {
      once: true
    });
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

async function handleGoogleCredential(response) {
  setCloudStatus("Verifying Google sign-in…");
  try {
    const result = await cloudApi("google-login", {
      method: "POST",
      body: { credential: response.credential }
    });
    cloudUser = result.user;
    updateCloudAccountUi();
    await refreshCloudProjects();
    setCloudStatus("Signed in");
  } catch (error) {
    setCloudStatus(error.message, true);
  }
}

async function prepareGoogleSignIn() {
  if (
    !cloudConfig ||
    !cloudConfig.googleClientId ||
    cloudConfig.googleClientId === "REPLACE_WITH_GOOGLE_CLIENT_ID"
  ) {
    googleSetupMessage.hidden = false;
    return;
  }

  try {
    await loadGoogleIdentityScript();
    googleSetupMessage.hidden = true;
    googleSignInButton.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: cloudConfig.googleClientId,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    window.google.accounts.id.renderButton(googleSignInButton, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular"
    });
  } catch (error) {
    setCloudStatus(error.message, true);
  }
}

async function signOutCloud() {
  try {
    const response = await cloudApi("logout", { method: "POST", body: {} });
    cloudConfig.csrf = response.csrf;
    cloudUser = null;
    cloudProjects = [];
    currentCloudProjectId = null;
    cloudAdminPanel.hidden = true;
    updateCloudAccountUi();
    await prepareGoogleSignIn();
    setCloudStatus("Signed out");
  } catch (error) {
    setCloudStatus(error.message, true);
  }
}

async function loadSharedProject(slug) {
  try {
    const response = await cloudApi("public-project", { query: { slug } });
    sharedCloudProject = response;
    sharedProjectName.textContent = response.meta.name;
    sharedProjectOwner.textContent = "Shared by " + response.meta.owner;
    sharedTapLink.href = response.meta.tapUrl;
    sharedQaopLink.href = qaopUrl(response.meta.tapUrl);
    sharedProjectPanel.hidden = false;
    openCloud();
  } catch (error) {
    setCloudStatus(error.message, true);
    openCloud();
  }
}

function openSharedProjectInEditor() {
  if (!sharedCloudProject) return;
  if (
    projectHasUnsavedChanges &&
    !window.confirm("Open this shared project and replace your current unsaved changes?")
  ) {
    return;
  }
  loadProjectData(sharedCloudProject.project, {
    dirty: true,
    statusMessage: "Shared project opened"
  });
  currentCloudProjectId = null;
  cloudProjectNameInput.value = sharedCloudProject.meta.name;
  cloudUpdateButton.disabled = true;
  closeCloud();
}

async function loadAdminPanel() {
  setCloudStatus("Loading administrator data…");
  try {
    const response = await cloudApi("admin-summary");
    cloudAdminPanel.hidden = false;
    renderAdminSummary(response.users, response.projects);
    setCloudStatus("");
  } catch (error) {
    setCloudStatus(error.message, true);
  }
}

function renderAdminSummary(users, projects) {
  adminSummary.replaceChildren();
  const totalBytes = users.reduce((sum, user) => sum + user.storageBytes, 0);
  const published = projects.filter((project) => project.published).length;
  [
    ["Users", users.length],
    ["Projects", projects.length],
    ["Published", published],
    ["Storage", formatCloudBytes(totalBytes)]
  ].forEach(([label, value]) => {
    const stat = document.createElement("div");
    stat.className = "admin-stat";
    const strong = document.createElement("strong");
    strong.textContent = value;
    const span = document.createElement("span");
    span.textContent = label;
    stat.append(strong, span);
    adminSummary.appendChild(stat);
  });

  adminUserList.replaceChildren();
  users.forEach((user) => {
    const row = document.createElement("div");
    row.className = "admin-row";
    if (user.status !== "active") row.classList.add("disabled");
    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = user.name + (user.role === "admin" ? " · Admin" : "");
    const meta = document.createElement("div");
    meta.className = "admin-meta";
    meta.textContent =
      user.email + " · " + user.projectCount + " projects · " +
      formatCloudBytes(user.storageBytes) + " · Last login " +
      formatCloudDate(user.lastLoginAt);
    details.append(name, meta);
    const actions = document.createElement("div");
    actions.className = "button-row";
    if (cloudUser && user.id !== cloudUser.id) {
      actions.appendChild(
        makeCloudButton(
          user.status === "active" ? "Disable" : "Enable",
          () => setAdminUserStatus(user.id, user.status === "active" ? "disabled" : "active")
        )
      );
    }
    row.append(details, actions);
    adminUserList.appendChild(row);
  });

  adminProjectList.replaceChildren();
  projects.forEach((project) => {
    const row = document.createElement("div");
    row.className = "admin-row";
    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = project.name;
    const meta = document.createElement("div");
    meta.className = "admin-meta";
    meta.textContent =
      project.ownerName + " · " + project.ownerEmail + " · " +
      (project.published ? "Published" : "Private") + " · " +
      formatCloudBytes(project.projectBytes + project.tapBytes);
    details.append(name, meta);
    const actions = document.createElement("div");
    actions.className = "button-row";
    actions.appendChild(makeCloudButton("Delete", () => adminDeleteProject(project)));
    row.append(details, actions);
    adminProjectList.appendChild(row);
  });
}

async function setAdminUserStatus(userId, statusValue) {
  if (!window.confirm((statusValue === "disabled" ? "Disable" : "Enable") + " this user?")) {
    return;
  }
  try {
    await cloudApi("admin-user-status", {
      method: "POST",
      body: { userId, status: statusValue }
    });
    await loadAdminPanel();
  } catch (error) {
    setCloudStatus(error.message, true);
  }
}

async function adminDeleteProject(project) {
  if (!window.confirm('Permanently delete "' + project.name + '" from this user?')) return;
  try {
    await cloudApi("admin-delete-project", {
      method: "POST",
      body: { id: project.id }
    });
    await loadAdminPanel();
  } catch (error) {
    setCloudStatus(error.message, true);
  }
}

async function initialiseCloudProjects() {
  try {
    cloudConfig = await cloudApi("config");
    const response = await cloudApi("me");
    cloudUser = response.user;
    updateCloudAccountUi();
    if (cloudUser) await refreshCloudProjects();
    else await prepareGoogleSignIn();

    const sharedSlug = new URLSearchParams(window.location.search).get("project");
    if (sharedSlug) await loadSharedProject(sharedSlug);
  } catch (error) {
    setCloudStatus(
      window.location.protocol === "file:"
        ? "Cloud Projects are available on the hosted beta."
        : error.message,
      true
    );
  }
}

function openCloud() {
  cloudPreviousFocus = document.activeElement;
  cloudOverlay.hidden = false;
  document.body.classList.add("help-open");
  closeCloudButton.focus();
}

function closeCloud() {
  if (cloudOverlay.hidden) return;
  cloudOverlay.hidden = true;
  document.body.classList.remove("help-open");
  if (cloudPreviousFocus instanceof HTMLElement) cloudPreviousFocus.focus();
}

function openHelp() {
  helpPreviousFocus = document.activeElement;
  helpOverlay.hidden = false;
  document.body.classList.add("help-open");
  helpDialogBody.scrollTop = 0;
  closeHelpButton.focus();
}

function closeHelp() {
  if (helpOverlay.hidden) return;
  helpOverlay.hidden = true;
  document.body.classList.remove("help-open");

  if (helpPreviousFocus instanceof HTMLElement) {
    helpPreviousFocus.focus();
  }
}

openHelpButton.addEventListener("click", openHelp);
closeHelpButton.addEventListener("click", closeHelp);
closeHelpBottomButton.addEventListener("click", closeHelp);

helpOverlay.addEventListener("click", (event) => {
  if (event.target === helpOverlay) closeHelp();
});

document.addEventListener("keydown", (event) => {
  if (helpOverlay.hidden) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeHelp();
    return;
  }

  if (event.key !== "Tab") return;

  const focusable = Array.from(
    helpOverlay.querySelectorAll("a[href], button:not([disabled])")
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

openCloudButton.addEventListener("click", () => {
  if (!cloudProjectNameInput.value) {
    cloudProjectNameInput.value = projectNameInput.value.trim() || "My Spectrum Graphics";
  }
  openCloud();
});
closeCloudButton.addEventListener("click", closeCloud);
cloudOverlay.addEventListener("click", (event) => {
  if (event.target === cloudOverlay) closeCloud();
});
document.getElementById("cloudSignOut").addEventListener("click", signOutCloud);
cloudSaveNewButton.addEventListener("click", () => saveCloudProject());
cloudUpdateButton.addEventListener("click", () => saveCloudProject(currentCloudProjectId));
document.getElementById("refreshCloudProjects").addEventListener("click", refreshCloudProjects);
document.getElementById("openSharedProject").addEventListener("click", openSharedProjectInEditor);
openCloudAdminButton.addEventListener("click", loadAdminPanel);
document.getElementById("closeCloudAdmin").addEventListener("click", () => {
  cloudAdminPanel.hidden = true;
});

document.addEventListener("keydown", (event) => {
  if (cloudOverlay.hidden) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeCloud();
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = Array.from(
    cloudOverlay.querySelectorAll(
      'a[href]:not([hidden]), button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden])'
    )
  ).filter((element) => element.offsetParent !== null);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

buildCollapsiblePanels();
configureResponsiveUi();
window.addEventListener("resize", configureResponsiveUi);
buildColourSelectors();
buildBankTabs(editorBankTabs, false);
buildBankTabs(screenBankTabs, true);
buildUdgList();
buildScreenUdgList();
buildEditor();
buildScreen();
restoreRecoveryProject();
refreshAll();
refreshScreenControls();
refreshTapInstructions();
initialiseCloudProjects();
