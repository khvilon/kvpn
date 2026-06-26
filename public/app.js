const keysBody = document.querySelector("#keys-body");
const createButton = document.querySelector("#create-key");
const logOutput = document.querySelector("#log-output");
let activeLog = "error";

function formatBytes(value) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value || 0);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function loadKeys() {
  const data = await api("/api/keys");
  keysBody.innerHTML = "";

  for (const key of data.keys) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input class="comment-input" value="${escapeHtml(key.comment)}" aria-label="Comment" /></td>
      <td>${escapeHtml(key.email)}</td>
      <td>${formatBytes(key.totalUplink)}</td>
      <td>${formatBytes(key.totalDownlink)}</td>
      <td><span class="muted">${new Date(key.createdAt).toLocaleString()}</span></td>
      <td>
        <div class="actions">
          <button data-action="copy">Copy</button>
          <button data-action="save">Save</button>
          <button class="danger" data-action="delete">Delete</button>
        </div>
      </td>
    `;
    row.querySelector('[data-action="copy"]').addEventListener("click", async () => {
      await navigator.clipboard.writeText(key.url);
    });
    row.querySelector('[data-action="save"]').addEventListener("click", async () => {
      const comment = row.querySelector(".comment-input").value;
      await api(`/api/keys/${key.id}`, {
        method: "PATCH",
        body: JSON.stringify({ comment }),
      });
      await loadKeys();
    });
    row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm(`Delete key "${key.comment || key.email}"?`)) {
        return;
      }
      await api(`/api/keys/${key.id}`, { method: "DELETE" });
      await loadKeys();
    });
    keysBody.appendChild(row);
  }
}

async function loadLogs() {
  const response = await fetch(`/api/logs?file=${activeLog}&lines=400`);
  logOutput.textContent = await response.text();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

createButton.addEventListener("click", async () => {
  const comment = prompt("Key comment", "");
  if (comment === null) {
    return;
  }
  await api("/api/keys", {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
  await loadKeys();
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.tab}`).classList.add("active");
    if (button.dataset.tab === "logs") {
      loadLogs().catch(console.error);
    }
  });
});

document.querySelectorAll(".log-tab").forEach((button) => {
  button.addEventListener("click", () => {
    activeLog = button.dataset.file;
    document.querySelectorAll(".log-tab").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    loadLogs().catch(console.error);
  });
});

loadKeys().catch((error) => {
  keysBody.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
});
setInterval(() => loadKeys().catch(console.error), 15000);
