/* =========================================================
   Cloud Endpoint Practice CRM
   Static, no backend: all data lives in this browser's
   localStorage. Export/Import JSON for backup and sharing.
   ========================================================= */

(() => {
  "use strict";

  const STORAGE_KEY = "cep-crm-v1";
  const THEME_KEY = "cep-crm-theme";

  /* Pipeline stages, in the order the practice works them.
     The typical flow starts with the scoping call. Edit this
     list to change the pipeline — everything (filters, badges,
     dashboard bars) follows it. */
  const STAGES = [
    { name: "Scoping Call",      color: "var(--cat-blue)",   active: true },
    { name: "Proposal",          color: "var(--cat-aqua)",   active: true },
    { name: "Statement of Work", color: "var(--cat-yellow)", active: true },
    { name: "In Delivery",       color: "var(--cat-violet)", active: true },
    { name: "On Hold",           color: "var(--cat-orange)", active: false },
    { name: "Complete",          color: "var(--cat-green)",  active: false },
    { name: "Lost",              color: "var(--cat-red)",    active: false },
  ];
  const PRIORITIES = ["High", "Medium", "Low"];

  /* ---------- state ---------- */

  let data = load();
  let view = "dashboard";          // dashboard | list | editor
  let editingId = null;            // null = creating a new opportunity
  let dirty = false;
  const filters = { q: "", stage: "", priority: "" };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.opportunities)) return parsed;
    } catch (e) { /* corrupted store — start fresh */ }
    return { version: 1, opportunities: [] };
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  /* ---------- helpers ---------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const esc = (s) => String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9));

  const todayISO = () => new Date().toISOString().slice(0, 10);

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function stageInfo(name) {
    return STAGES.find((s) => s.name === name) || STAGES[0];
  }

  function getDeep(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function setDeep(obj, path, value) {
    const keys = path.split(".");
    let o = obj;
    keys.slice(0, -1).forEach((k) => { o = o[k] ??= {}; });
    o[keys.at(-1)] = value;
  }

  function nextEngagementId() {
    let max = 0;
    for (const o of data.opportunities) {
      const m = /(\d+)\s*$/.exec(o.engagement?.id || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `CEP-${new Date().getFullYear()}-${String(max + 1).padStart(3, "0")}`;
  }

  function blankOpportunity() {
    return {
      id: uid(),
      customer: { name: "", industry: "", region: "", accountOwner: "", tier: "" },
      engagement: { id: nextEngagementId(), projectName: "", stage: STAGES[0].name,
                    priority: "Medium", startDate: "", endDate: "" },
      scope: { objectives: "", inScope: "", outOfScope: "", assumptions: "", constraints: "" },
      environment: { deviceCount: "", osMix: "", existingMdm: "", identityPlatform: "", securityStack: "" },
      requirements: { business: "", technical: "", compliance: "" },
      deliverables: { plannedOutputs: "", documentation: "", workshops: "", migrationTasks: "" },
      risks: [],
      actions: [],
      meetings: [],
      metrics: { adoptionPct: "", compliancePct: "", devicesMigrated: "", satisfaction: "" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ---------- theme ---------- */

  function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    const system = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = stored || system;
  }

  $("#btn-theme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  });

  /* ---------- navigation ---------- */

  function show(name) {
    if (view === "editor" && name !== "editor" && dirty &&
        !confirm("Discard unsaved changes?")) return;
    view = name;
    dirty = false;
    $("#view-dashboard").hidden = name !== "dashboard";
    $("#view-list").hidden = name !== "list";
    $("#view-editor").hidden = name !== "editor";
    $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.nav === name));
    if (name === "dashboard") renderDashboard();
    if (name === "list") renderList();
    window.scrollTo({ top: 0 });
  }

  $$(".tab").forEach((t) => t.addEventListener("click", () => show(t.dataset.nav)));

  /* ---------- dashboard ---------- */

  function renderDashboard() {
    const opps = data.opportunities;
    const empty = opps.length === 0;
    $("#dashboard-empty").hidden = !empty;
    $(".tile-row").hidden = empty;
    $(".dash-grid").hidden = empty;
    if (empty) return;

    const activeStages = new Set(STAGES.filter((s) => s.active).map((s) => s.name));
    const active = opps.filter((o) => activeStages.has(o.engagement.stage)).length;
    const openActions = opps.flatMap((o) => o.actions)
      .filter((a) => a.status === "Open" || a.status === "In progress").length;
    const openRisks = opps.flatMap((o) => o.risks).filter((r) => r.status === "Open").length;

    $("#stat-tiles").innerHTML = [
      { label: "Total opportunities", value: opps.length },
      { label: "Active engagements", value: active, sub: "scoping through delivery" },
      { label: "Open actions", value: openActions, sub: "open or in progress" },
      { label: "Open risks & blockers", value: openRisks },
    ].map((t) => `
      <div class="tile">
        <div class="tile-label">${t.label}</div>
        <div class="tile-value">${t.value}</div>
        ${t.sub ? `<div class="tile-sub">${t.sub}</div>` : ""}
      </div>`).join("");

    // pipeline bar list — count per stage, direct-labeled
    const counts = STAGES.map((s) => opps.filter((o) => o.engagement.stage === s.name).length);
    const max = Math.max(...counts, 1);
    $("#stage-bars").innerHTML = STAGES.map((s, i) => `
      <button class="stage-row" data-stage="${esc(s.name)}"
              title="Show ${esc(s.name)} opportunities">
        <span class="stage-name"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span>
        <span class="track"><span class="bar" style="width:${(counts[i] / max) * 100}%;background:${s.color}"></span></span>
        <span class="count">${counts[i]}</span>
      </button>`).join("");

    $$("#stage-bars .stage-row").forEach((row) =>
      row.addEventListener("click", () => {
        filters.stage = row.dataset.stage;
        $("#filter-stage").value = filters.stage;
        show("list");
      }));

    // upcoming actions across all opportunities
    const today = todayISO();
    const actions = opps.flatMap((o) => o.actions
      .filter((a) => a.status === "Open" || a.status === "In progress")
      .map((a) => ({ ...a, customer: o.customer.name, oppId: o.id })));
    actions.sort((a, b) => (a.dueDate || "9999") < (b.dueDate || "9999") ? -1 : 1);
    $("#upcoming-actions").innerHTML = actions.length ? `
      <ul class="mini-list">${actions.slice(0, 6).map((a) => `
        <li data-open="${a.oppId}">
          <span class="mini-main">
            <strong>${esc(a.description) || "(no description)"}</strong>
            <small>${esc(a.customer)}${a.owner ? " · " + esc(a.owner) : ""}</small>
          </span>
          <span class="mini-side ${a.dueDate && a.dueDate < today ? "overdue" : ""}">${fmtDate(a.dueDate)}</span>
        </li>`).join("")}
      </ul>` : `<p class="mini-empty">No open actions. 🎉</p>`;

    // open risks across all opportunities
    const risks = opps.flatMap((o) => o.risks
      .filter((r) => r.status === "Open")
      .map((r) => ({ ...r, customer: o.customer.name, oppId: o.id })));
    $("#open-risks").innerHTML = risks.length ? `
      <ul class="mini-list">${risks.slice(0, 6).map((r) => `
        <li data-open="${r.oppId}">
          <span class="mini-main">
            <strong>${esc(r.description) || "(no description)"}</strong>
            <small>${esc(r.customer)} · ${esc(r.type)}</small>
          </span>
        </li>`).join("")}
      </ul>` : `<p class="mini-empty">No open risks.</p>`;

    $$("#upcoming-actions li, #open-risks li").forEach((li) => {
      li.style.cursor = "pointer";
      li.addEventListener("click", () => openEditor(li.dataset.open));
    });
  }

  /* ---------- opportunity list ---------- */

  function initFilters() {
    $("#filter-stage").innerHTML =
      `<option value="">All stages</option>` +
      STAGES.map((s) => `<option>${esc(s.name)}</option>`).join("");
    $("#filter-priority").innerHTML =
      `<option value="">All priorities</option>` +
      PRIORITIES.map((p) => `<option>${p}</option>`).join("");

    $("#filter-q").addEventListener("input", (e) => { filters.q = e.target.value; renderList(); });
    $("#filter-stage").addEventListener("change", (e) => { filters.stage = e.target.value; renderList(); });
    $("#filter-priority").addEventListener("change", (e) => { filters.priority = e.target.value; renderList(); });
  }

  function filteredOpps() {
    const q = filters.q.trim().toLowerCase();
    return data.opportunities
      .filter((o) => {
        if (filters.stage && o.engagement.stage !== filters.stage) return false;
        if (filters.priority && o.engagement.priority !== filters.priority) return false;
        if (!q) return true;
        return [o.customer.name, o.engagement.projectName, o.customer.accountOwner,
                o.engagement.id, o.customer.industry, o.customer.region]
          .some((v) => (v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  function renderList() {
    const rows = filteredOpps();
    $("#list-empty").hidden = rows.length > 0;
    $(".opps-table").hidden = rows.length === 0;

    $("#opps-tbody").innerHTML = rows.map((o) => {
      const s = stageInfo(o.engagement.stage);
      const prio = (o.engagement.priority || "Medium").toLowerCase();
      return `
        <tr data-id="${o.id}">
          <td class="mono">${esc(o.engagement.id)}</td>
          <td><strong>${esc(o.customer.name)}</strong></td>
          <td class="wrap">${esc(o.engagement.projectName)}</td>
          <td><span class="badge"><span class="dot" style="background:${s.color}"></span>${esc(o.engagement.stage)}</span></td>
          <td><span class="prio prio-${esc(prio)}">${esc(o.engagement.priority)}</span></td>
          <td>${esc(o.customer.accountOwner) || "—"}</td>
          <td>${fmtDate(o.engagement.endDate)}</td>
          <td>${fmtDate((o.updatedAt || "").slice(0, 10))}</td>
        </tr>`;
    }).join("");

    $$("#opps-tbody tr").forEach((tr) =>
      tr.addEventListener("click", () => openEditor(tr.dataset.id)));
  }

  /* ---------- editor ---------- */

  const form = $("#opp-form");

  function initStageSelect() {
    $("#input-stage").innerHTML = STAGES.map((s) => `<option>${esc(s.name)}</option>`).join("");
  }

  function openEditor(id) {
    editingId = id || null;
    const opp = id
      ? data.opportunities.find((o) => o.id === id)
      : blankOpportunity();
    if (!opp) { toast("Opportunity not found"); return; }

    $("#editor-title").textContent = id
      ? `${opp.customer.name} — ${opp.engagement.projectName}` : "New opportunity";
    $("#btn-delete").hidden = !id;

    // scalar fields
    $$("[name]", form).forEach((el) => { el.value = getDeep(opp, el.name) ?? ""; el.classList.remove("invalid"); });

    // repeatable rows
    ["risk", "action", "meeting"].forEach((kind) => {
      const box = $(`#${kind}-rows`);
      box.innerHTML = "";
      (opp[kind + "s"] || []).forEach((item) => addRow(kind, item));
    });

    show("editor");
    dirty = false;
  }

  function addRow(kind, values = {}) {
    const tpl = $(`#tpl-${kind}`);
    const node = tpl.content.firstElementChild.cloneNode(true);
    $$("[data-f]", node).forEach((el) => { el.value = values[el.dataset.f] ?? el.value; });
    $(".remove-row", node).addEventListener("click", () => { node.remove(); dirty = true; });
    $(`#${kind}-rows`).appendChild(node);
    return node;
  }

  $$(".add-row").forEach((btn) =>
    btn.addEventListener("click", () => {
      const row = addRow(btn.dataset.add);
      $("input, textarea, select", row)?.focus();
      dirty = true;
    }));

  form.addEventListener("input", () => { dirty = true; });

  function harvestForm() {
    const base = editingId
      ? structuredClone(data.opportunities.find((o) => o.id === editingId))
      : blankOpportunity();

    $$("[name]", form).forEach((el) => setDeep(base, el.name, el.value.trim()));

    ["risk", "action", "meeting"].forEach((kind) => {
      base[kind + "s"] = $$(`#${kind}-rows .repeat-row`).map((row) => {
        const item = {};
        $$("[data-f]", row).forEach((el) => { item[el.dataset.f] = el.value.trim(); });
        return item;
      }).filter((item) => Object.entries(item)
        .some(([k, v]) => v && k !== "type" && k !== "status"));
    });

    base.updatedAt = new Date().toISOString();
    return base;
  }

  function saveOpportunity() {
    // required: customer name + project name
    let ok = true;
    for (const name of ["customer.name", "engagement.projectName"]) {
      const el = $(`[name="${name}"]`, form);
      el.classList.toggle("invalid", !el.value.trim());
      if (!el.value.trim()) ok = false;
    }
    if (!ok) {
      toast("Customer name and project name are required");
      $(".invalid", form)?.focus();
      return;
    }

    const opp = harvestForm();
    if (!opp.engagement.id) opp.engagement.id = nextEngagementId();

    if (editingId) {
      const i = data.opportunities.findIndex((o) => o.id === editingId);
      data.opportunities[i] = opp;
    } else {
      data.opportunities.push(opp);
    }
    persist();
    dirty = false;
    toast("Opportunity saved");
    show("list");
  }

  $("#btn-save").addEventListener("click", saveOpportunity);
  form.addEventListener("submit", (e) => { e.preventDefault(); saveOpportunity(); });
  $("#btn-back").addEventListener("click", () => show("list"));
  $("#btn-cancel").addEventListener("click", () => show("list"));

  $("#btn-delete").addEventListener("click", () => {
    const opp = data.opportunities.find((o) => o.id === editingId);
    if (!opp) return;
    if (!confirm(`Delete "${opp.customer.name} — ${opp.engagement.projectName}"? This cannot be undone.`)) return;
    data.opportunities = data.opportunities.filter((o) => o.id !== editingId);
    persist();
    dirty = false;
    toast("Opportunity deleted");
    show("list");
  });

  $("#btn-new").addEventListener("click", () => openEditor(null));

  /* ---------- export / import ---------- */

  function download(filename, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  $("#btn-export-json").addEventListener("click", () => {
    download(`cep-crm-backup-${todayISO()}.json`,
      JSON.stringify(data, null, 2), "application/json");
    toast("JSON backup downloaded");
  });

  $("#btn-import").addEventListener("click", () => $("#file-import").click());

  $("#file-import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.opportunities)) throw new Error("bad shape");
      if (data.opportunities.length &&
          !confirm(`Replace the current ${data.opportunities.length} opportunit${data.opportunities.length === 1 ? "y" : "ies"} with the ${parsed.opportunities.length} in this file?`)) return;
      data = { version: 1, opportunities: parsed.opportunities };
      persist();
      toast(`Imported ${data.opportunities.length} opportunities`);
      show(view === "editor" ? "list" : view);
    } catch (err) {
      toast("Import failed — not a valid CRM backup file");
    }
  });

  $("#btn-export-csv").addEventListener("click", () => {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Engagement ID", "Customer", "Industry", "Region", "Account Owner", "Tier",
      "Project", "Stage", "Priority", "Start Date", "End Date", "Device Count",
      "Existing MDM", "Identity Platform", "Adoption %", "Compliance %",
      "Devices Migrated", "Satisfaction", "Open Actions", "Open Risks"];
    const rows = filteredOpps().map((o) => [
      o.engagement.id, o.customer.name, o.customer.industry, o.customer.region,
      o.customer.accountOwner, o.customer.tier, o.engagement.projectName,
      o.engagement.stage, o.engagement.priority, o.engagement.startDate, o.engagement.endDate,
      o.environment.deviceCount, o.environment.existingMdm, o.environment.identityPlatform,
      o.metrics.adoptionPct, o.metrics.compliancePct, o.metrics.devicesMigrated, o.metrics.satisfaction,
      o.actions.filter((a) => a.status === "Open" || a.status === "In progress").length,
      o.risks.filter((r) => r.status === "Open").length,
    ].map(q).join(","));
    download(`cep-crm-opportunities-${todayISO()}.csv`,
      [head.map(q).join(","), ...rows].join("\r\n"), "text/csv");
    toast(`Exported ${rows.length} rows to CSV`);
  });

  /* ---------- sample data ---------- */

  function loadSampleData() {
    const mk = (over) => Object.assign(blankOpportunity(), over);
    const now = new Date().toISOString();
    data.opportunities.push(
      mk({
        customer: { name: "Northwind Logistics", industry: "Logistics", region: "UK",
                    accountOwner: "George Parker", tier: "Tier 1 — Strategic" },
        engagement: { id: "CEP-2026-001", projectName: "Intune Migration & Autopilot Rollout",
                      stage: "In Delivery", priority: "High",
                      startDate: "2026-05-11", endDate: "2026-09-30" },
        scope: {
          objectives: "Move all corporate Windows devices from ConfigMgr to Intune-native management; enable Autopilot provisioning for new starters.",
          inScope: "Windows 11 estate, Autopilot, compliance policies, app packaging (top 40 apps).",
          outOfScope: "Server management, macOS estate, conditional access redesign.",
          assumptions: "Entra hybrid join already in place; network allows Intune traffic.",
          constraints: "Change freeze during Black Friday peak (Nov).",
        },
        environment: { deviceCount: "3200", osMix: "85% Win 11, 10% Win 10, 5% iOS",
                       existingMdm: "ConfigMgr co-managed", identityPlatform: "Hybrid — Entra ID + AD",
                       securityStack: "Defender for Endpoint, Zscaler" },
        requirements: {
          business: "Reduce imaging time for new starters from 2 days to under 2 hours.",
          technical: "All policies as code where possible; co-management workloads shifted in phases.",
          compliance: "Cyber Essentials Plus recertification in October.",
        },
        deliverables: {
          plannedOutputs: "Autopilot deployment profiles, compliance baseline, workload migration plan.",
          documentation: "HLD, LLD, operational runbooks, as-built.",
          workshops: "Admin handover workshop, service desk training.",
          migrationTasks: "GPO → Intune policy migration, app packaging, pilot ring rollout.",
        },
        risks: [
          { type: "Risk", description: "Legacy VPN client blocks Autopilot white glove", mitigation: "Test pre-provisioning in lab; fallback to user-driven mode", status: "Open" },
          { type: "Dependency", description: "Network team must allow-list Intune endpoints", mitigation: "Firewall change raised (CHG-4412)", status: "Mitigated" },
        ],
        actions: [
          { description: "Complete pilot ring (150 devices)", owner: "George Parker", dueDate: "2026-07-10", status: "In progress" },
          { description: "Sign off compliance baseline with security team", owner: "S. Ahmed", dueDate: "2026-07-17", status: "Open" },
        ],
        meetings: [
          { date: "2026-06-24", attendees: "GP, IT Director, EUC Lead", summary: "Pilot review — 92% success rate, printer driver issues on 8 devices.", decisions: "Proceed to ring 2; printer app to be repackaged." },
        ],
        metrics: { adoptionPct: "34", compliancePct: "88", devicesMigrated: "1080", satisfaction: "4 — High" },
        createdAt: now, updatedAt: now,
      }),
      mk({
        customer: { name: "Fabrikam Health", industry: "Healthcare", region: "UK",
                    accountOwner: "George Parker", tier: "Tier 2 — Enterprise" },
        engagement: { id: "CEP-2026-002", projectName: "Windows 11 Upgrade & Compliance Baseline",
                      stage: "Scoping Call", priority: "Medium",
                      startDate: "", endDate: "" },
        scope: { objectives: "Assess readiness for Windows 11 across clinical and back-office devices; define compliance baseline aligned to NHS DSPT.",
                 inScope: "", outOfScope: "", assumptions: "", constraints: "Clinical devices cannot reboot during ward hours." },
        environment: { deviceCount: "5400", osMix: "70% Win 10, 25% Win 11, 5% iOS",
                       existingMdm: "ConfigMgr (SCCM)", identityPlatform: "On-prem Active Directory",
                       securityStack: "Sophos, on-prem proxy" },
        requirements: { business: "", technical: "", compliance: "NHS DSPT, DCB0129 for clinical systems." },
        actions: [
          { description: "Run scoping call — capture current estate & pain points", owner: "George Parker", dueDate: "2026-07-08", status: "Open" },
        ],
        meetings: [],
        createdAt: now, updatedAt: now,
      }),
      mk({
        customer: { name: "Tailwind Retail", industry: "Retail", region: "EMEA",
                    accountOwner: "L. Chen", tier: "Tier 3 — Mid-market" },
        engagement: { id: "CEP-2026-003", projectName: "macOS Management Onboarding",
                      stage: "Proposal", priority: "Low",
                      startDate: "2026-08-03", endDate: "2026-09-11" },
        scope: { objectives: "Bring 240 unmanaged MacBooks under Intune management with baseline security controls.",
                 inScope: "macOS enrolment, FileVault, Platform SSO.", outOfScope: "Windows estate.",
                 assumptions: "Apple Business Manager already configured.", constraints: "" },
        environment: { deviceCount: "240", osMix: "100% macOS", existingMdm: "None",
                       identityPlatform: "Entra ID (cloud-only)", securityStack: "Defender for Endpoint" },
        actions: [
          { description: "Send proposal & SoW draft", owner: "L. Chen", dueDate: "2026-07-04", status: "In progress" },
        ],
        createdAt: now, updatedAt: now,
      }),
      mk({
        customer: { name: "Contoso Legal", industry: "Legal", region: "UK",
                    accountOwner: "George Parker", tier: "Tier 2 — Enterprise" },
        engagement: { id: "CEP-2026-004", projectName: "Endpoint Security Uplift",
                      stage: "Complete", priority: "Medium",
                      startDate: "2026-02-02", endDate: "2026-05-29" },
        scope: { objectives: "Harden endpoint estate: ASR rules, BitLocker, LAPS, security baselines.",
                 inScope: "900 Windows devices.", outOfScope: "", assumptions: "", constraints: "" },
        environment: { deviceCount: "900", osMix: "100% Win 11", existingMdm: "Microsoft Intune",
                       identityPlatform: "Entra ID (cloud-only)", securityStack: "Defender for Endpoint" },
        metrics: { adoptionPct: "100", compliancePct: "97", devicesMigrated: "900", satisfaction: "5 — Very high" },
        risks: [
          { type: "Risk", description: "ASR rules may block legacy dictation app", mitigation: "Exclusion added after audit-mode review", status: "Closed" },
        ],
        createdAt: now, updatedAt: now,
      }),
    );
    persist();
    toast("Sample data loaded — 4 opportunities");
    show(view);
  }

  $$("[data-action]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.action === "new") openEditor(null);
      if (btn.dataset.action === "sample") loadSampleData();
    }));

  /* ---------- init ---------- */

  initTheme();
  initFilters();
  initStageSelect();
  show("dashboard");
})();
