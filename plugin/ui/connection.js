/**
 * Shared "Grafana connection" section of the property inspectors.
 *
 * The plugin owns the connection: this page sends URL and service account
 * token once ({ event: "connect" }) and shows the status the plugin reports
 * back ({ event: "status" }). Both are kept in the plugin's global settings.
 */
(function () {
  const client = SDPIComponents.streamDeckClient;
  const $ = (id) => document.getElementById(id);

  const STATE_TEXT = {
    connected: "Connected",
    connecting: "Checking connection…",
    error: "Connection problem",
    unconfigured: "Not configured",
  };

  function send(payload) {
    client.send("sendToPlugin", payload);
  }

  function showMessage(text, kind) {
    const box = $("grafana-message");
    box.textContent = text || "";
    box.className = `message ${kind || ""}`;
    box.hidden = !text;
  }

  let editing = false;

  function renderStatus(status) {
    const badge = $("grafana-status");
    badge.className = `status ${status.state}`;
    $("grafana-status-text").textContent = STATE_TEXT[status.state] || status.state;
    $("grafana-status-detail").textContent = status.error
      ? status.error
      : status.state === "connected"
        ? `${status.url} · ${status.org}`
        : status.url || "Enter your Grafana URL and a service account token.";

    const showForm = !status.configured || editing;
    $("grafana-form").hidden = !showForm;
    $("grafana-edit").hidden = showForm;
    for (const el of document.querySelectorAll(".requires-connection")) {
      el.hidden = !status.configured;
    }
    if (status.url && !$("grafana-url").value) {
      $("grafana-url").value = status.url;
    }
    $("grafana-token").placeholder = status.configured ? "Leave empty to keep the current token" : "glsa_…";
  }

  client.sendToPropertyInspector.subscribe((message) => {
    const payload = message.payload || {};
    if (payload.event === "status") {
      renderStatus(payload);
    } else if (payload.event === "connect") {
      $("grafana-connect").disabled = false;
      if (payload.ok) {
        editing = false;
        showMessage(`Connected to ${payload.org}`, "success");
        $("grafana-token").value = "";
      } else {
        showMessage(payload.error, "error");
      }
      send({ event: "getStatus" });
    }
  });

  const TEMPLATE = `
    <sdpi-item label="Grafana">
      <div id="grafana-status" class="status unconfigured">
        <div><strong id="grafana-status-text">…</strong><span id="grafana-status-detail"></span></div>
      </div>
    </sdpi-item>
    <div id="grafana-message" class="message" hidden></div>
    <div id="grafana-form" hidden>
      <sdpi-item label="URL"><sdpi-textfield id="grafana-url" placeholder="https://grafana.example.com"></sdpi-textfield></sdpi-item>
      <sdpi-item label="Token"><sdpi-password id="grafana-token" placeholder="glsa_…"></sdpi-password></sdpi-item>
      <sdpi-item><sdpi-button id="grafana-connect">Save and test connection</sdpi-button></sdpi-item>
      <p class="hint">
        Create a service account with the Viewer role in Grafana (Administration → Users and access → Service accounts)
        and add a token to it. The token is stored in the Stream Deck settings on this computer only.
      </p>
    </div>
    <div id="grafana-edit" hidden>
      <sdpi-item><sdpi-button id="grafana-edit-button">Change connection</sdpi-button></sdpi-item>
    </div>`;

  window.addEventListener("DOMContentLoaded", () => {
    $("grafana-connection").innerHTML = TEMPLATE;

    $("grafana-connect").addEventListener("click", () => {
      const url = ($("grafana-url").value || "").trim();
      const token = ($("grafana-token").value || "").trim();
      if (!url) {
        showMessage("Please enter the Grafana URL", "error");
        return;
      }
      if (!/^https?:\/\//i.test(url)) {
        showMessage("The URL must start with http:// or https://", "error");
        return;
      }
      showMessage("Testing connection…", "");
      $("grafana-connect").disabled = true;
      send({ event: "connect", url, token });
    });

    $("grafana-edit-button").addEventListener("click", () => {
      editing = true;
      showMessage("", "");
      send({ event: "getStatus" });
    });

    send({ event: "getStatus" });
  });
})();
