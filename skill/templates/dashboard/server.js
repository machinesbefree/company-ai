#!/usr/bin/env node
// Company dashboard server — serves HTML + reads state.json directly from disk
// Zero dependencies, runs on bare Node.js
//
// Usage: node server.js
// Env:   DASHBOARD_PORT (default 3141), STATE_FILE (default ~/.openclaw/company/state.json)

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = parseInt(process.env.DASHBOARD_PORT || "3141", 10);
const STATE_FILE =
  process.env.STATE_FILE ||
  path.join(process.env.HOME, ".openclaw/company/state.json");
const DASHBOARD_HTML = path.join(__dirname, "index.html");

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Dashboard HTML
  if ((req.url === "/" || req.url === "/index.html") && req.method === "GET") {
    try {
      const html = fs.readFileSync(DASHBOARD_HTML, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Dashboard HTML not found: " + e.message);
    }
    return;
  }

  // Health check
  if (req.url === "/health" && req.method === "GET") {
    const state = readState();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        has_state: state !== null,
        company: state?.meta?.company_name || null,
      })
    );
    return;
  }

  // API endpoint — matches what the dashboard SPA expects
  if (req.url === "/api/gateway/company.api" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const state = readState();
      if (!state) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            payload: {
              meta: { company_name: "No Company", domain: "No state file found" },
              ceo: { focus: "standby", goals: [] },
              finance: { runway_months: 0, attention: "none", report: "No data" },
              operations: { active_projects: [], attention: "none", report: "No data" },
              strategy: { current_priorities: [], attention: "none", report: "No data" },
              personnel: { org_mood: "unknown", attention: "none", report: "No data" },
              risks: { top_risks: [], attention: "none", report: "No data" },
              queue: { pending_count: 0, decisions: [], report: "No decisions" },
            },
          })
        );
        return;
      }

      let params = {};
      try {
        params = JSON.parse(body);
      } catch {}

      if (params.action === "get") {
        if (params.section && state[params.section]) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, payload: state[params.section] }));
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, payload: state }));
        }
      } else if (params.action === "resolve_decision") {
        // Voice agent can resolve decisions via this endpoint
        const decId = params.id;
        const decStatus = params.status;
        const decidedBy = params.decided_by || "Human (voice)";
        if (!decId || !decStatus) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "id and status required" }));
          return;
        }
        const decisions = state.queue?.decisions || [];
        const dec = decisions.find((d) => d.id === decId);
        if (!dec) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `Decision not found: ${decId}` }));
          return;
        }
        dec.status = decStatus;
        dec.resolved_at = new Date().toISOString();
        dec.decided_by = decidedBy;
        // Update queue counts
        const pendingCount = decisions.filter((d) => d.status === "pending").length;
        state.queue.pending_count = pendingCount;
        state.queue.last_decision = dec.summary;
        state.queue.last_decision_by = decidedBy;
        state.queue.awaiting_human = decisions
          .filter((d) => d.status === "pending" && d.requires_human)
          .map((d) => `[${d.source}] ${d.summary}`);
        state.lastUpdated = Date.now();
        try {
          fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, payload: { decision: dec } }));
        } catch (e) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Failed to write state: " + e.message }));
        }
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ ok: false, error: "Supported actions: get, resolve_decision" })
        );
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Company dashboard: ${url}`);
  // Write URL to a file so other scripts can read it
  const urlFile = path.join(path.dirname(STATE_FILE), "dashboard.url");
  try {
    fs.writeFileSync(urlFile, url + "\n");
  } catch {}
});
