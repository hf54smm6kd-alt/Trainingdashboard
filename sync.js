/* ============================================================================
 * sync.js — Cross-device sync via a private GitHub Gist. No backend needed.
 * ----------------------------------------------------------------------------
 * Your sessions are stored as a JSON file inside a private gist. Any device
 * with your token pulls the gist, merges by session id (last-write-wins on
 * updatedAt, with delete propagation via tombstones), then pushes back.
 *
 * Pure-ish: network functions + a pure mergeEnvelopes() that is unit-tested.
 * Exposed as window.Sync. No DOM access here.
 * ==========================================================================*/
(function (global) {
  "use strict";

  const API = "https://api.github.com";
  const FILENAME = "athletic-load-tracker.json";
  const DESC = "Athletic Load Tracker — synced data (private)";
  const TOMB_TTL_DAYS = 180; // prune delete tombstones older than this

  function headers(token) {
    return {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  async function req(token, method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: headers(token),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).message || ""; } catch (e) {}
      const msg = res.status === 401 ? "Bad token (401) — check the token has the gist scope."
        : res.status === 404 ? "Gist not found (404) — wrong gist ID or token can't see it."
        : res.status === 403 ? "Forbidden / rate-limited (403). " + detail
        : `GitHub API ${res.status}. ${detail}`;
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  // Verify the token and return the GitHub login it belongs to.
  async function whoami(token) {
    const me = await req(token, "GET", "/user");
    return me.login;
  }

  // Create a new private gist, return its id.
  async function createGist(token, payload) {
    const body = {
      description: DESC,
      public: false,
      files: { [FILENAME]: { content: JSON.stringify(payload, null, 2) } },
    };
    const g = await req(token, "POST", "/gists", body);
    return g.id;
  }

  // Update an existing gist's file.
  async function updateGist(token, gistId, payload) {
    const body = { files: { [FILENAME]: { content: JSON.stringify(payload, null, 2) } } };
    await req(token, "PATCH", "/gists/" + gistId, body);
    return gistId;
  }

  // Pull the envelope from a gist (null if the file is empty/new).
  async function pullGist(token, gistId) {
    const g = await req(token, "GET", "/gists/" + gistId);
    const file = g.files && g.files[FILENAME];
    if (!file) return null;
    let content = file.content;
    if (file.truncated && file.raw_url) {
      content = await (await fetch(file.raw_url)).text();
    }
    try { return JSON.parse(content); } catch (e) { return null; }
  }

  // ---- Pure data model ----------------------------------------------------
  function makeEnvelope(sessions, tombstones) {
    return {
      schema: 1,
      updatedAt: new Date().toISOString(),
      sessions: sessions || [],
      tombstones: tombstones || {},
    };
  }

  // Merge two envelopes deterministically. Last-write-wins per session id by
  // updatedAt; deletes win when the tombstone is newer than the record.
  function mergeEnvelopes(local, remote) {
    const byId = new Map();
    const tomb = {};
    const consider = (env) => {
      if (!env) return;
      for (const s of env.sessions || []) {
        if (!s || !s.id) continue;
        const ex = byId.get(s.id);
        if (!ex || (s.updatedAt || "") >= (ex.updatedAt || "")) byId.set(s.id, s);
      }
      for (const [id, t] of Object.entries(env.tombstones || {})) {
        if (!tomb[id] || t > tomb[id]) tomb[id] = t;
      }
    };
    // remote first so that, on an exact tie, local wins (the active device)
    consider(remote);
    consider(local);

    for (const [id, t] of Object.entries(tomb)) {
      const s = byId.get(id);
      if (s && t >= (s.updatedAt || "")) byId.delete(id);
    }

    // prune ancient tombstones
    const cutoff = new Date(Date.now() - TOMB_TTL_DAYS * 864e5).toISOString();
    for (const [id, t] of Object.entries(tomb)) if (t < cutoff) delete tomb[id];

    const sessions = [...byId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return makeEnvelope(sessions, tomb);
  }

  global.Sync = {
    FILENAME, whoami, createGist, updateGist, pullGist,
    makeEnvelope, mergeEnvelopes,
  };
})(typeof window !== "undefined" ? window : globalThis);
