"use strict";

const state = {
  sources: [],
  destination: null,
  comparisons: [],
  copied: 0,
};

const els = {
  addSourceBtn: document.querySelector("#addSourceBtn"),
  pickDestinationBtn: document.querySelector("#pickDestinationBtn"),
  scanBtn: document.querySelector("#scanBtn"),
  backupBtn: document.querySelector("#backupBtn"),
  clearHistoryBtn: document.querySelector("#clearHistoryBtn"),
  sourcesList: document.querySelector("#sourcesList"),
  destinationLabel: document.querySelector("#destinationLabel"),
  changesView: document.querySelector("#changesView"),
  supportWarning: document.querySelector("#supportWarning"),
  sourceCount: document.querySelector("#sourceCount"),
  changeCount: document.querySelector("#changeCount"),
  copiedCount: document.querySelector("#copiedCount"),
  logList: document.querySelector("#logList"),
  spaceInfo: document.querySelector("#spaceInfo"),
  folderTemplate: document.querySelector("#folderTemplate"),
  versioningToggle: document.querySelector("#versioningToggle"),
  hashToggle: document.querySelector("#hashToggle"),
};

const supportsFileSystem = typeof window.showDirectoryPicker === "function";
els.supportWarning.hidden = supportsFileSystem;

function log(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  els.logList.prepend(item);
}

function updateCounts() {
  const changes = state.comparisons.reduce(
    (total, item) => total + item.newFiles.length + item.changedFiles.length + item.missingFiles.length,
    0,
  );
  els.sourceCount.textContent = state.sources.length;
  els.changeCount.textContent = changes;
  els.copiedCount.textContent = state.copied;
  els.backupBtn.disabled = !state.destination || changes === 0;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function safeName(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 120) || "carpeta";
}

function manifestKey(sourceName) {
  return `alfombra-backup:manifest:${sourceName}`;
}

function readManifest(sourceName) {
  try {
    return JSON.parse(localStorage.getItem(manifestKey(sourceName)) || "{}");
  } catch {
    return {};
  }
}

function saveManifest(sourceName, manifest) {
  localStorage.setItem(manifestKey(sourceName), JSON.stringify(manifest));
}

function renderSources() {
  els.sourcesList.innerHTML = "";
  els.sourcesList.classList.toggle("empty", state.sources.length === 0);
  if (!state.sources.length) {
    els.sourcesList.textContent = "Sin carpetas seleccionadas";
    updateCounts();
    return;
  }

  state.sources.forEach((source, index) => {
    const row = document.createElement("div");
    row.className = "source-pill";
    row.innerHTML = `<strong>${source.name}</strong>`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.title = "Quitar carpeta";
    remove.textContent = "x";
    remove.addEventListener("click", () => {
      state.sources.splice(index, 1);
      state.comparisons = state.comparisons.filter((item) => item.sourceName !== source.name);
      renderSources();
      renderComparisons();
      log(`Carpeta quitada: ${source.name}`);
    });
    row.append(remove);
    els.sourcesList.append(row);
  });
  updateCounts();
}

async function addSource() {
  if (!supportsFileSystem) return;
  const handle = await window.showDirectoryPicker({ mode: "read" });
  if (state.sources.some((source) => source.name === handle.name)) {
    log(`La carpeta ${handle.name} ya estaba seleccionada.`);
    return;
  }
  state.sources.push({ name: handle.name, handle });
  renderSources();
  log(`Carpeta añadida: ${handle.name}`);
}

async function pickDestination() {
  if (!supportsFileSystem) return;
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  state.destination = { name: handle.name, handle };
  els.destinationLabel.textContent = handle.name;
  log(`Destino elegido: ${handle.name}`);
  updateCounts();
}

async function scanDirectory(handle, basePath = "") {
  const files = {};
  for await (const [name, child] of handle.entries()) {
    const relativePath = basePath ? `${basePath}/${name}` : name;
    if (child.kind === "directory") {
      Object.assign(files, await scanDirectory(child, relativePath));
      continue;
    }
    const file = await child.getFile();
    const record = {
      name,
      path: relativePath,
      size: file.size,
      lastModified: file.lastModified,
      hash: null,
    };
    if (els.hashToggle.checked) {
      record.hash = await hashFile(file);
    }
    files[relativePath] = record;
  }
  return files;
}

async function hashFile(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function compareManifests(current, previous) {
  const newFiles = [];
  const changedFiles = [];
  const missingFiles = [];

  for (const [path, file] of Object.entries(current)) {
    const old = previous[path];
    if (!old) {
      newFiles.push(file);
      continue;
    }
    const changed =
      old.size !== file.size ||
      old.lastModified !== file.lastModified ||
      (file.hash && old.hash && file.hash !== old.hash);
    if (changed) changedFiles.push({ ...file, previous: old });
  }

  for (const [path, file] of Object.entries(previous)) {
    if (!current[path]) missingFiles.push(file);
  }

  return { newFiles, changedFiles, missingFiles };
}

async function scanAll() {
  if (!state.sources.length) {
    log("Añade al menos una carpeta antes de escanear.");
    return;
  }

  state.comparisons = [];
  els.changesView.className = "changes-view empty-state";
  els.changesView.innerHTML = "<h3>Escaneando...</h3><p>Esto puede tardar si hay muchas subcarpetas.</p>";

  for (const source of state.sources) {
    log(`Escaneando ${source.name}...`);
    const current = await scanDirectory(source.handle);
    const previous = readManifest(source.name);
    const diff = compareManifests(current, previous);
    state.comparisons.push({
      sourceName: source.name,
      handle: source.handle,
      manifest: current,
      previousManifest: previous,
      ...diff,
      decisions: { new: true, changed: true, missing: false },
    });
    log(
      `${source.name}: ${diff.newFiles.length} nuevos, ${diff.changedFiles.length} cambiados, ${diff.missingFiles.length} eliminados.`,
    );
  }
  renderComparisons();
}

function renderComparisons() {
  updateCounts();
  if (!state.comparisons.length) {
    els.changesView.className = "changes-view empty-state";
    els.changesView.innerHTML = "<h3>Listo para escanear</h3><p>Agrega carpetas, elige destino y ejecuta el escaneo.</p>";
    return;
  }

  els.changesView.className = "changes-view";
  els.changesView.innerHTML = "";

  state.comparisons.forEach((comparison) => {
    const node = els.folderTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("h3").textContent = comparison.sourceName;
    node.querySelector("p").textContent = `${Object.keys(comparison.manifest).length} archivos revisados`;
    node.querySelector(".folder-stats").innerHTML = `
      <span class="badge new">${comparison.newFiles.length} nuevos</span>
      <span class="badge changed">${comparison.changedFiles.length} cambiados</span>
      <span class="badge missing">${comparison.missingFiles.length} faltantes</span>
    `;

    node.querySelectorAll(".decision-row input").forEach((input) => {
      input.checked = comparison.decisions[input.dataset.kind];
      input.addEventListener("change", () => {
        comparison.decisions[input.dataset.kind] = input.checked;
        updateCounts();
      });
    });

    const groups = node.querySelector(".file-groups");
    groups.append(
      fileGroup("Nuevos", comparison.newFiles, "Aparecen en el origen y no estaban en el historial."),
      fileGroup("Cambiados", comparison.changedFiles, "Mismo nombre, distinto tamaño, fecha o hash."),
      fileGroup("Eliminados del origen", comparison.missingFiles, "Se registran, pero no se borran del backup."),
    );
    els.changesView.append(node);
  });
}

function fileGroup(title, files, hint) {
  const details = document.createElement("details");
  details.className = "file-group";
  details.open = files.length > 0 && files.length <= 8;
  details.innerHTML = `<summary><span>${title}</span><span>${files.length}</span></summary>`;
  const list = document.createElement("div");
  list.className = "file-list";

  if (!files.length) {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `<strong>Sin archivos</strong><span></span><span>${hint}</span>`;
    list.append(row);
  } else {
    files.slice(0, 300).forEach((file) => {
      const row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = `
        <strong title="${file.path}">${file.path}</strong>
        <span>${formatBytes(file.size)}</span>
        <span>${new Date(file.lastModified).toLocaleString()}</span>
      `;
      list.append(row);
    });
    if (files.length > 300) {
      const row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = `<strong>+ ${files.length - 300} más</strong><span></span><span>Se copiarán aunque no se listen aquí.</span>`;
      list.append(row);
    }
  }
  details.append(list);
  return details;
}

async function getOrCreateDirectory(root, parts) {
  let cursor = root;
  for (const part of parts.filter(Boolean).map(safeName)) {
    cursor = await cursor.getDirectoryHandle(part, { create: true });
  }
  return cursor;
}

async function getFileFromPath(root, path) {
  const parts = path.split("/");
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    cursor = await cursor.getDirectoryHandle(part);
  }
  return cursor.getFileHandle(parts.at(-1));
}

async function writeFile(root, path, file) {
  const parts = path.split("/");
  const directory = await getOrCreateDirectory(root, parts.slice(0, -1));
  const target = await directory.getFileHandle(parts.at(-1), { create: true });
  const writable = await target.createWritable();
  await writable.write(file);
  await writable.close();
}

async function backupAll() {
  if (!state.destination) {
    log("Elige un destino antes de copiar.");
    return;
  }

  const backupRoot = await getOrCreateDirectory(state.destination.handle, ["AlfombraBackup"]);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let copied = 0;

  for (const comparison of state.comparisons) {
    const folderRoot = await getOrCreateDirectory(backupRoot, [comparison.sourceName]);
    const latestRoot = await getOrCreateDirectory(folderRoot, ["latest"]);
    const versionRoot = await getOrCreateDirectory(folderRoot, ["_versions", stamp]);
    const logRoot = await getOrCreateDirectory(folderRoot, ["_logs"]);
    const selected = [
      ...(comparison.decisions.new ? comparison.newFiles : []),
      ...(comparison.decisions.changed ? comparison.changedFiles : []),
    ];

    for (const item of selected) {
      const sourceHandle = await getFileFromPath(comparison.handle, item.path);
      const file = await sourceHandle.getFile();
      await writeFile(latestRoot, item.path, file);
      if (els.versioningToggle.checked && item.previous) {
        await writeFile(versionRoot, item.path, file);
      }
      copied += 1;
      state.copied = copied;
      updateCounts();
    }

    const nextManifest = { ...comparison.previousManifest };
    selected.forEach((item) => {
      nextManifest[item.path] = comparison.manifest[item.path];
    });
    if (comparison.decisions.missing) {
      comparison.missingFiles.forEach((item) => {
        delete nextManifest[item.path];
      });
    }

    const report = {
      date: new Date().toISOString(),
      source: comparison.sourceName,
      copied: selected.length,
      skippedNew: comparison.decisions.new ? 0 : comparison.newFiles.length,
      skippedChanged: comparison.decisions.changed ? 0 : comparison.changedFiles.length,
      missingRegistered: comparison.decisions.missing ? comparison.missingFiles : [],
    };
    await writeTextFile(logRoot, `${stamp}.json`, JSON.stringify(report, null, 2));
    saveManifest(comparison.sourceName, nextManifest);
    log(`${comparison.sourceName}: ${selected.length} archivos copiados y manifiesto actualizado.`);
  }

  state.copied = copied;
  updateCounts();
  log(`Copia finalizada: ${copied} archivos.`);
}

async function writeTextFile(root, name, text) {
  const target = await root.getFileHandle(name, { create: true });
  const writable = await target.createWritable();
  await writable.write(new Blob([text], { type: "application/json" }));
  await writable.close();
}

function clearHistory() {
  const keys = Object.keys(localStorage).filter((key) => key.startsWith("alfombra-backup:manifest:"));
  keys.forEach((key) => localStorage.removeItem(key));
  state.comparisons = [];
  renderComparisons();
  log("Historial local borrado. El próximo escaneo será una copia completa.");
}

async function updateStorageEstimate() {
  if (!navigator.storage?.estimate) return;
  const estimate = await navigator.storage.estimate();
  els.spaceInfo.textContent = `Navegador: ${formatBytes(estimate.usage)} usados de ${formatBytes(estimate.quota)}. Espacio real de USB requiere Electron.`;
}

els.addSourceBtn.addEventListener("click", () => addSource().catch((error) => log(error.message)));
els.pickDestinationBtn.addEventListener("click", () => pickDestination().catch((error) => log(error.message)));
els.scanBtn.addEventListener("click", () => scanAll().catch((error) => log(error.message)));
els.backupBtn.addEventListener("click", () => backupAll().catch((error) => log(error.message)));
els.clearHistoryBtn.addEventListener("click", clearHistory);

renderSources();
renderComparisons();
updateStorageEstimate();
log("Kopia Desk iniciado. Para la prueba, añade la carpeta FOTOS como origen.");
