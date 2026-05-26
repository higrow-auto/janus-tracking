/* ─── Utils ────────────────────────────────────────────────────── */
function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ─── API Cache (30s TTL) ─────────────────────────────────────── */
const Cache = {
  _store: {},
  get(key) {
    const e = this._store[key];
    if (!e || Date.now() - e.ts > 30_000) { delete this._store[key]; return null; }
    return e.data;
  },
  set(key, data) { this._store[key] = { data, ts: Date.now() }; },
  del(...keys) { keys.forEach(k => delete this._store[k]); },
};

/* ─── API ──────────────────────────────────────────────────────── */
const API = {
  token: null,
  base: '/api',

  async req(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { App.logout(); return null; }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  },

  async get(path) {
    const cached = Cache.get(path);
    if (cached !== null) return cached;
    const data = await this.req('GET', path);
    if (data !== null) Cache.set(path, data);
    return data;
  },

  async post(path, body) {
    const data = await this.req('POST', path, body);
    Cache.del(path, path.replace(/\/[^/]+$/, ''));
    return data;
  },

  async put(path, body) {
    const data = await this.req('PUT', path, body);
    Cache.del(path, path.replace(/\/[^/]+$/, ''));
    return data;
  },

  async del(path) {
    const data = await this.req('DELETE', path);
    Cache.del(path, path.replace(/\/[^/]+$/, ''));
    return data;
  },
};

/* ─── Toast ───────────────────────────────────────────────────── */
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

/* ─── Modal ───────────────────────────────────────────────────── */
const Modal = {
  open(title, bodyHtml, onSubmit, submitLabel) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;

    const footer = document.getElementById('modal-footer');
    if (onSubmit) {
      const label = submitLabel || 'Salvar';
      footer.innerHTML = `
        <button type="button" class="btn btn-secondary" id="modal-cancel-btn">Cancelar</button>
        <button type="button" class="btn btn-primary" id="modal-submit-btn">${label}</button>`;
      document.getElementById('modal-cancel-btn').addEventListener('click', () => Modal.close());
      document.getElementById('modal-submit-btn').addEventListener('click', () => {
        const form = document.getElementById('modal-form');
        if (form && !form.checkValidity()) { form.reportValidity(); return; }
        onSubmit();
      });
    } else {
      footer.innerHTML = '';
    }

    document.getElementById('modal-overlay').classList.remove('hidden');
  },

  close() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
    document.getElementById('modal-footer').innerHTML = '';
  },
};

/* ─── URL Preview ─────────────────────────────────────────────── */
function buildPreviewUrl() {
  const base = document.getElementById('f-base-url')?.value?.trim() || '';
  const el = document.getElementById('url-preview');
  if (!el) return;

  if (!base) {
    el.textContent = 'Insira a URL base para ver o preview';
    el.className = 'url-preview';
    return;
  }

  try {
    const url = new URL(base);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(k => {
      const v = document.getElementById('f-' + k.replace('_','-').replace('_','-'))?.value?.trim();
      if (v) url.searchParams.set(k, v);
    });
    el.textContent = url.toString();
    el.className = 'url-preview has-url';
  } catch {
    el.textContent = 'URL inválida';
    el.className = 'url-preview';
  }
}

function attachPreviewListeners() {
  ['f-base-url','f-utm-source','f-utm-medium','f-utm-campaign','f-utm-term','f-utm-content']
    .forEach(id => document.getElementById(id)?.addEventListener('input', buildPreviewUrl));
}

/* ─── A/B Rows ────────────────────────────────────────────────── */
let abRows = [];

function renderAbRows() {
  const wrap = document.getElementById('ab-rows');
  if (!wrap) return;
  wrap.innerHTML = abRows.map((row, i) => `
    <div class="ab-row">
      <input type="url" placeholder="https://..." value="${esc(row.url)}"
             oninput="abRows[${i}].url=this.value">
      <input type="number" min="1" max="100" value="${esc(row.weight)}" title="Peso (%)"
             oninput="abRows[${i}].weight=+this.value">
      <button type="button" class="btn-remove" onclick="removeAbRow(${i})">×</button>
    </div>
  `).join('');
}

function addAbRow()       { abRows.push({ url: '', weight: 50 }); renderAbRows(); }
function removeAbRow(i)   { abRows.splice(i, 1); renderAbRows(); }
function toggleAb(on) {
  document.getElementById('ab-section').style.display = on ? 'block' : 'none';
  if (on && abRows.length === 0) { addAbRow(); addAbRow(); }
}

/* ─── Export CSV ──────────────────────────────────────────────── */
function downloadCSV(type) {
  const token = API.token;
  const url = `/api/export/${type}`;
  const a = document.createElement('a');
  a.href = url + '?token=' + encodeURIComponent(token);
  a.download = type + '.csv';
  a.click();
}

/* ─── Link Form HTML ──────────────────────────────────────────── */
function linkFormHtml(link, campaigns) {
  const isEdit = !!link;
  const campOptions = campaigns.map(c =>
    `<option value="${esc(c.id)}" ${link?.campaign_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`
  ).join('');
  const hasAb = Array.isArray(link?.split_urls) && link.split_urls.length > 0;

  return `
  <form id="modal-form">
    <div class="field">
      <label>URL Base (Destino) *</label>
      <input type="url" id="f-base-url" placeholder="https://hotmart.com/produto/..."
             value="${esc(link?.base_url)}" required>
    </div>

    <div class="section-label">UTM Builder</div>
    <div class="field-row">
      <div class="field">
        <label>utm_source</label>
        <input type="text" id="f-utm-source" placeholder="facebook"
               value="${esc(link?.utm_parameters?.utm_source)}">
      </div>
      <div class="field">
        <label>utm_medium</label>
        <input type="text" id="f-utm-medium" placeholder="cpc"
               value="${esc(link?.utm_parameters?.utm_medium)}">
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>utm_campaign</label>
        <input type="text" id="f-utm-campaign" placeholder="black-friday-2025"
               value="${esc(link?.utm_parameters?.utm_campaign)}">
      </div>
      <div class="field">
        <label>utm_content</label>
        <input type="text" id="f-utm-content" placeholder="banner-topo"
               value="${esc(link?.utm_parameters?.utm_content)}">
      </div>
    </div>
    <div class="field">
      <label>utm_term</label>
      <input type="text" id="f-utm-term" placeholder="curso online"
             value="${esc(link?.utm_parameters?.utm_term)}">
    </div>

    <div class="field">
      <label>Preview da URL Final</label>
      <div class="url-preview" id="url-preview">Insira a URL base para ver o preview</div>
    </div>

    <div class="section-label">Configuração</div>
    <div class="field-row">
      <div class="field">
        <label>Slug ${isEdit ? '(somente leitura)' : 'personalizado'}</label>
        <input type="text" id="f-slug" placeholder="promo-black-friday"
               value="${esc(link?.slug)}" ${isEdit ? 'readonly style="opacity:.5;cursor:not-allowed"' : ''}>
        <p class="field-hint">${isEdit ? 'O slug não pode ser alterado após a criação.' : 'Deixe vazio para gerar automaticamente.'}</p>
      </div>
      <div class="field">
        <label>Campanha</label>
        <select id="f-campaign">
          <option value="">Sem campanha</option>
          ${campOptions}
        </select>
      </div>
    </div>

    <div class="toggle-row">
      <div>
        <div class="toggle-label">Teste A/B</div>
        <div class="toggle-sub">Divide o tráfego entre múltiplas URLs destino</div>
      </div>
      <label class="switch">
        <input type="checkbox" id="f-ab-toggle" ${hasAb ? 'checked' : ''}
               onchange="toggleAb(this.checked)">
        <span class="slider"></span>
      </label>
    </div>

    <div id="ab-section" style="display:${hasAb ? 'block' : 'none'}">
      <div id="ab-rows"></div>
      <button type="button" class="btn-add-ab" onclick="addAbRow()">+ Adicionar URL</button>
      <p class="field-hint" style="margin-top:8px">Pesos são relativos (50/50 = distribuição igual)</p>
    </div>
  </form>`;
}

/* ─── Pages ───────────────────────────────────────────────────── */
const Pages = {

  /* DASHBOARD */
  async dashboard() {
    document.getElementById('page-content').innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <div class="page-title">Dashboard</div>
            <div class="page-sub">Visão geral da plataforma</div>
          </div>
          <button class="btn btn-primary" onclick="Pages.openCreateLink()">
            <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Novo Link
          </button>
        </div>
        <div class="stats-grid" id="stats-grid">
          ${[...Array(4)].map(() => `
            <div class="stat-card">
              <div class="stat-label">Carregando...</div>
              <div class="stat-value">—</div>
            </div>`).join('')}
        </div>
        <div class="card">
          <div class="card-title">Top Links</div>
          <div id="top-links-wrap"><div class="empty-state"><p>Carregando...</p></div></div>
        </div>
      </div>`;

    try {
      const data = await API.get('/analytics/overview');
      if (!data) {
        document.getElementById('stats-grid').innerHTML = `<div class="stat-card" style="grid-column:1/-1;text-align:center;color:var(--text-2)">Erro ao carregar dados. <button onclick="Pages.dashboard()" style="color:#C4B5FD;text-decoration:underline;background:none;border:none;cursor:pointer">Tentar novamente</button></div>`;
        return;
      }

      document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card">
          <div class="stat-label">Total de Links</div>
          <div class="stat-value violet">${data.total_links}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Cliques Hoje</div>
          <div class="stat-value green">${data.clicks_today}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Cliques Reais (Total)</div>
          <div class="stat-value">${data.real_clicks}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Campanhas</div>
          <div class="stat-value blue">${data.total_campaigns}</div>
        </div>`;

      const topHtml = data.top_links?.length
        ? `<div class="table-wrap"><table>
            <thead><tr><th>Slug</th><th>Destino</th><th>Cliques Reais</th></tr></thead>
            <tbody>${data.top_links.map(l => `
              <tr>
                <td class="slug-cell"><a href="/${esc(l.slug)}" target="_blank">/${esc(l.slug)}</a></td>
                <td class="url-cell" title="${esc(l.base_url)}">${esc(l.base_url)}</td>
                <td>${l.real_clicks}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>`
        : `<div class="empty-state"><div class="icon">🔗</div><p>Nenhum link criado ainda</p></div>`;

      document.getElementById('top-links-wrap').innerHTML = topHtml;
    } catch (e) { toast(e.message, 'error'); }
  },

  /* LINKS */
  async links() {
    document.getElementById('page-content').innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <div class="page-title">Links</div>
            <div class="page-sub">Gerencie seus links e UTMs</div>
          </div>
          <button class="btn btn-primary" onclick="Pages.openCreateLink()">
            <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Novo Link
          </button>
        </div>
        <div class="toolbar">
          <input class="search-input" id="link-search"
                 placeholder="Buscar por slug ou URL..." oninput="Pages.loadLinks()">
          <select class="filter-select" id="link-camp-filter" onchange="Pages.loadLinks()">
            <option value="">Todas as campanhas</option>
          </select>
        </div>
        <div class="card" style="padding:0">
          <div id="links-table-wrap"><div class="empty-state"><p>Carregando...</p></div></div>
        </div>
      </div>`;

    try {
      const camps = await API.get('/campaigns');
      const sel = document.getElementById('link-camp-filter');
      if (camps && sel) {
        camps.forEach(c => {
          const o = document.createElement('option');
          o.value = c.id; o.textContent = c.name;
          sel.appendChild(o);
        });
      }
    } catch {}

    await Pages.loadLinks();

    document.getElementById('links-table-wrap').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, slug, url } = btn.dataset;
      if (action === 'copy')      copyLink(url);
      if (action === 'analytics') App.navigate('analytics', id);
      if (action === 'edit')      Pages.openEditLink(id);
      if (action === 'delete')    Pages.deleteLink(id, slug);
      if (action === 'toggle')    Pages.toggleActive(id, slug, btn.dataset.active === 'true');
      if (action === 'wordpress') Pages.openWordPressIntegration(slug, url);
    });
  },

  async loadLinks() {
    const search = document.getElementById('link-search')?.value || '';
    const camp   = document.getElementById('link-camp-filter')?.value || '';
    const wrap   = document.getElementById('links-table-wrap');
    if (!wrap) return;

    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (camp)   qs.set('campaign_id', camp);

    const cacheKey = '/links?' + qs;
    try {
      const links = await API.get(cacheKey);
      if (!links) {
        wrap.innerHTML = `<div class="empty-state"><p>Erro ao carregar links. <button onclick="Pages.loadLinks()" style="color:#C4B5FD;text-decoration:underline;background:none;border:none;cursor:pointer">Tentar novamente</button></p></div>`;
        return;
      }

      if (!links.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="icon">🔗</div><p>Nenhum link encontrado</p></div>`;
        return;
      }

      const host = window.location.origin;
      wrap.innerHTML = `
        <div class="table-wrap"><table>
          <thead>
            <tr>
              <th>Slug</th><th>Destino</th><th>Campanha</th>
              <th>Cliques</th><th>Status</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${links.map(l => `
              <tr>
                <td>
                  <div class="slug-cell">/${esc(l.slug)}</div>
                  <div class="text-sm text-muted mono" style="font-size:10px">
                    ${esc(host)}/${esc(l.slug)}
                  </div>
                </td>
                <td class="url-cell" title="${esc(l.base_url)}">${esc(l.base_url)}</td>
                <td>${l.campaign_name
                  ? `<span class="badge badge-blue">${esc(l.campaign_name)}</span>`
                  : '<span class="text-muted">—</span>'}</td>
                <td>
                  ${l.real_clicks ?? 0}
                  <span class="text-muted text-sm">/ ${l.total_clicks ?? 0}</span>
                </td>
                <td>
                  ${l.active
                    ? '<span class="badge badge-green">Ativo</span>'
                    : '<span class="badge badge-red">Inativo</span>'}
                </td>
                <td>
                  <div class="actions">
                    <button class="btn-icon success" title="Copiar link"
                            data-action="copy" data-url="${esc(host + '/' + l.slug)}">
                      <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                    </button>
                    <button class="btn-icon" title="Integrar com WordPress/Elementor"
                            data-action="wordpress" data-slug="${esc(l.slug)}" data-url="${esc(host + '/' + l.slug)}">
                      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM3.5 12c0-.96.18-1.88.49-2.74L7.6 20.3A8.52 8.52 0 0 1 3.5 12zm8.5 8.5c-.96 0-1.88-.15-2.74-.43l2.91-8.46 2.98 8.17c.02.05.04.09.07.13A8.47 8.47 0 0 1 12 20.5zm1.22-12.86l2.51 7.48-3.54-1.06-1.45-4.2 2.48-2.22zm3.26 10.84l-2.5-7.44 2.28.68 2.16 6.47a8.54 8.54 0 0 1-1.94.29zM19.26 16l-1.9-5.68c.31-.12.59-.29.82-.54.55-.6.83-1.39.83-2.37 0-.78-.28-1.46-.83-1.99C17.63 4.9 16.84 4.5 16 4.5H8v.6c.58.21.96.77.96 1.4v11c0 .63-.38 1.19-.96 1.4V19h3.5v-.6c-.58-.21-.96-.77-.96-1.4v-4.5h1.26L14.3 19h2.38c.93 0 1.78-.15 2.58-.36z"/></svg>
                    </button>
                    <button class="btn-icon" title="Ver analytics"
                            data-action="analytics" data-id="${esc(l.id)}">
                      <svg viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>
                    </button>
                    <button class="btn-icon" title="Editar"
                            data-action="edit" data-id="${esc(l.id)}">
                      <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    </button>
                    <button class="btn-icon" title="${l.active ? 'Desativar' : 'Ativar'}"
                            data-action="toggle" data-id="${esc(l.id)}"
                            data-slug="${esc(l.slug)}" data-active="${l.active}">
                      <svg viewBox="0 0 24 24"><path d="${l.active
                        ? 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z'
                        : 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z'}"/></svg>
                    </button>
                    <button class="btn-icon danger" title="Excluir"
                            data-action="delete" data-id="${esc(l.id)}" data-slug="${esc(l.slug)}">
                      <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table></div>`;
    } catch (e) {
      toast(e.message, 'error');
      const w = document.getElementById('links-table-wrap');
      if (w) w.innerHTML = `<div class="empty-state"><p>Erro ao carregar links. <button onclick="Pages.loadLinks()" style="color:#C4B5FD;text-decoration:underline;background:none;border:none;cursor:pointer">Tentar novamente</button></p></div>`;
    }
  },

  /* CAMPAIGNS */
  async campaigns() {
    document.getElementById('page-content').innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <div class="page-title">Campanhas</div>
            <div class="page-sub">Organize seus links por campanha</div>
          </div>
          <button class="btn btn-primary" onclick="Pages.openCreateCampaign()">
            <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Nova Campanha
          </button>
        </div>
        <div class="card" style="padding:0">
          <div id="camps-wrap"><div class="empty-state"><p>Carregando...</p></div></div>
        </div>
      </div>`;

    await Pages.loadCampaigns();

    document.getElementById('camps-wrap').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'delete-camp') {
        Pages.deleteCampaign(btn.dataset.id, btn.dataset.name);
      }
    });
  },

  async loadCampaigns() {
    const wrap = document.getElementById('camps-wrap');
    if (!wrap) return;
    try {
      const camps = await API.get('/campaigns');
      if (!camps) {
        wrap.innerHTML = `<div class="empty-state"><p>Erro ao carregar campanhas. <button onclick="Pages.loadCampaigns()" style="color:#C4B5FD;text-decoration:underline;background:none;border:none;cursor:pointer">Tentar novamente</button></p></div>`;
        return;
      }
      if (!camps.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="icon">📂</div><p>Nenhuma campanha criada</p></div>`;
        return;
      }
      wrap.innerHTML = `
        <div class="table-wrap"><table>
          <thead><tr><th>Nome</th><th>Descrição</th><th>Links</th><th>Criada em</th><th>Ações</th></tr></thead>
          <tbody>
            ${camps.map(c => `
              <tr>
                <td><strong>${esc(c.name)}</strong></td>
                <td class="text-muted">${esc(c.description) || '—'}</td>
                <td>${c.link_count ?? 0}</td>
                <td class="text-muted">${new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
                <td>
                  <div class="actions">
                    <button class="btn-icon danger" title="Excluir"
                            data-action="delete-camp"
                            data-id="${esc(c.id)}" data-name="${esc(c.name)}">
                      <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table></div>`;
    } catch (e) { toast(e.message, 'error'); }
  },

  /* ANALYTICS */
  async analytics(preselectedId) {
    document.getElementById('page-content').innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <div class="page-title">Analytics</div>
            <div class="page-sub">Performance dos seus links</div>
          </div>
        </div>
        <div class="analytics-controls">
          <select class="filter-select" id="analytics-link-sel"
                  style="flex:1;min-width:250px" onchange="Pages.loadAnalytics()">
            <option value="">Selecione um link...</option>
          </select>
          <select class="filter-select" id="analytics-period" onchange="Pages.loadAnalytics()">
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
        </div>
        <div id="analytics-content">
          <div class="empty-state"><div class="icon">📊</div><p>Selecione um link para ver os dados</p></div>
        </div>
      </div>`;

    try {
      const links = await API.get('/links');
      if (!links) {
        document.getElementById('analytics-content').innerHTML = `<div class="empty-state"><p>Erro ao carregar links. <button onclick="Pages.analytics()" style="color:#C4B5FD;text-decoration:underline;background:none;border:none;cursor:pointer">Tentar novamente</button></p></div>`;
        return;
      }
      if (links) {
        const sel = document.getElementById('analytics-link-sel');
        if (!sel) return;
        links.forEach(l => {
          const o = document.createElement('option');
          o.value = l.id;
          o.textContent = `/${l.slug} — ${l.base_url.slice(0, 50)}`;
          if (l.id === preselectedId) o.selected = true;
          sel.appendChild(o);
        });
        if (preselectedId) await Pages.loadAnalytics();
      }
    } catch (e) { toast(e.message, 'error'); }
  },

  analyticsChart: null,

  async loadAnalytics() {
    const id     = document.getElementById('analytics-link-sel')?.value;
    const period = document.getElementById('analytics-period')?.value || '7';
    if (!id) return;

    try {
      const { series, totals, referrers } = await API.get(`/analytics/links/${id}?period=${period}`);
      const wrap = document.getElementById('analytics-content');

      wrap.innerHTML = `
        <div class="mini-stats">
          <div class="mini-stat">
            <div class="v green">${totals.real_clicks}</div>
            <div class="l">Cliques Reais</div>
          </div>
          <div class="mini-stat">
            <div class="v">${totals.total_clicks}</div>
            <div class="l">Total de Cliques</div>
          </div>
          <div class="mini-stat">
            <div class="v" style="color:var(--text-3)">${totals.bot_clicks}</div>
            <div class="l">Bots Filtrados</div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Cliques por Dia</div>
          <div class="chart-container"><canvas id="analytics-chart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Top Referrers</div>
          ${referrers.length ? (() => {
            const max = Math.max(...referrers.map(r => r.count), 1);
            return `<ul class="referrer-list">${referrers.map(r => `
              <li>
                <span class="mono text-sm">${esc(r.referer) || 'Direto'}</span>
                <div class="referrer-bar-wrap">
                  <div class="referrer-bar" style="width:${(r.count/max*100).toFixed(1)}%"></div>
                </div>
                <span>${r.count}</span>
              </li>`).join('')}</ul>`;
          })() : '<p class="text-muted text-sm">Sem dados de referrer</p>'}
        </div>`;

      if (Pages.analyticsChart) Pages.analyticsChart.destroy();
      const ctx = document.getElementById('analytics-chart').getContext('2d');
      Pages.analyticsChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: series.map(s => new Date(s.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })),
          datasets: [
            {
              label: 'Cliques Reais',
              data: series.map(s => s.real),
              borderColor: '#6366F1',
              backgroundColor: 'rgba(99,102,241,.08)',
              fill: true, tension: 0.4, pointRadius: 3,
            },
            {
              label: 'Bots',
              data: series.map(s => s.bots),
              borderColor: '#D1D5DB',
              backgroundColor: 'transparent',
              borderDash: [4, 4], tension: 0.4, pointRadius: 2,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { labels: { color: '#6B7280', boxWidth: 12 } } },
          scales: {
            x: { grid: { color: '#F3F4F6' }, ticks: { color: '#9CA3AF' } },
            y: { grid: { color: '#F3F4F6' }, ticks: { color: '#9CA3AF' }, beginAtZero: true },
          },
        },
      });
    } catch (e) { toast(e.message, 'error'); }
  },

  /* ─── Link CRUD ─────────────────────────────────────────────── */
  async openCreateLink() {
    abRows = [];
    try {
      const camps = await API.get('/campaigns') || [];
      Modal.open('Criar Novo Link', linkFormHtml(null, camps), () => Pages.submitLink(null), 'Criar Link');
      attachPreviewListeners();
    } catch (e) { toast(e.message, 'error'); }
  },

  async openEditLink(id) {
    try {
      const [link, camps] = await Promise.all([
        API.get(`/links/${id}`),
        API.get('/campaigns'),
      ]);
      if (!link) return;
      abRows = Array.isArray(link.split_urls) ? [...link.split_urls] : [];
      Modal.open('Editar Link', linkFormHtml(link, camps || []), () => Pages.submitLink(id), 'Salvar alterações');
      attachPreviewListeners();
      if (abRows.length) renderAbRows();
      buildPreviewUrl();
    } catch (e) { toast(e.message, 'error'); }
  },

  async submitLink(id) {
    const abOn = document.getElementById('f-ab-toggle')?.checked;
    const payload = {
      base_url:       document.getElementById('f-base-url')?.value?.trim(),
      campaign_id:    document.getElementById('f-campaign')?.value || null,
      utm_parameters: abOn ? {} : {
        utm_source:   document.getElementById('f-utm-source')?.value?.trim()   || '',
        utm_medium:   document.getElementById('f-utm-medium')?.value?.trim()   || '',
        utm_campaign: document.getElementById('f-utm-campaign')?.value?.trim() || '',
        utm_term:     document.getElementById('f-utm-term')?.value?.trim()     || '',
        utm_content:  document.getElementById('f-utm-content')?.value?.trim()  || '',
      },
      split_urls: abOn ? abRows.filter(r => r.url) : [],
    };

    if (!id) {
      const slug = document.getElementById('f-slug')?.value?.trim();
      if (slug) payload.slug = slug;
    }

    if (!payload.base_url) { toast('URL base é obrigatória', 'error'); return; }

    try {
      if (id) {
        await API.put(`/links/${id}`, payload);
        Cache.del('/links', '/analytics/overview');
        toast('Link atualizado!');
      } else {
        await API.post('/links', payload);
        Cache.del('/links', '/analytics/overview');
        toast('Link criado!');
      }
      Modal.close();
      App.navigate('links');
    } catch (e) { toast(e.message, 'error'); }
  },

  async deleteLink(id, slug) {
    if (!confirm(`Excluir o link /${slug}?\n\nEsta ação não pode ser desfeita.`)) return;
    try {
      await API.del(`/links/${id}`);
      Cache.del('/links', '/analytics/overview');
      toast('Link excluído');
      await Pages.loadLinks();
    } catch (e) { toast(e.message, 'error'); }
  },

  async toggleActive(id, slug, currentlyActive) {
    try {
      await API.put(`/links/${id}`, { active: !currentlyActive });
      Cache.del('/links');
      toast(currentlyActive ? `/${slug} desativado` : `/${slug} ativado`);
      await Pages.loadLinks();
    } catch (e) { toast(e.message, 'error'); }
  },

  openWordPressIntegration(slug, linkUrl) {
    const webhookUrl = window.location.origin + '/webhooks/leads?source=' + encodeURIComponent(slug);
    const snippet = `<script>
(function($) {
  var pageParams = {};
  new URLSearchParams(window.location.search).forEach(function(v, k) {
    pageParams[k] = v;
  });
  $(document).on('submit_success', '.elementor-form', function() {
    var dest = new URL('${linkUrl}');
    Object.keys(pageParams).forEach(function(k) {
      dest.searchParams.set(k, pageParams[k]);
    });
    window.location.href = dest.toString();
  });
})(jQuery);
<\/script>`;

    function step(n, color, text) {
      return \`<div style="display:flex;gap:12px;align-items:flex-start">
        <div style="min-width:24px;height:24px;border-radius:50%;background:\${color};color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">\${n}</div>
        <div style="font-size:13px;color:#C4B5FD;line-height:1.6">\${text}</div>
      </div>\`;
    }

    Modal.open('Integrar com WordPress / Elementor', \`
      <div style="display:flex;flex-direction:column;gap:20px">

        <div style="background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.25);border-radius:8px;padding:14px 16px">
          <div style="font-size:11px;font-weight:600;color:#C4B5FD;margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Link Janus configurado</div>
          <div style="font-size:13px;color:#E8EAFF;font-family:monospace;word-break:break-all">${esc(linkUrl)}</div>
          <div style="font-size:11px;color:#7B85B0;margin-top:4px">UTMs e todos os parâmetros da URL são repassados automaticamente ao destino.</div>
        </div>

        <!-- TABS -->
        <div>
          <div style="display:flex;gap:8px;margin-bottom:16px">
            <button id="tab-gtm" onclick="document.getElementById('panel-gtm').style.display='flex';document.getElementById('panel-wp').style.display='none';document.getElementById('tab-gtm').style.background='#7C3AED';document.getElementById('tab-gtm').style.color='#fff';document.getElementById('tab-wp').style.background='rgba(124,58,237,.12)';document.getElementById('tab-wp').style.color='#C4B5FD';"
              style="flex:1;padding:8px;border-radius:8px;border:1px solid rgba(124,58,237,.3);background:#7C3AED;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">
              ⬡ Google Tag Manager
            </button>
            <button id="tab-wp" onclick="document.getElementById('panel-wp').style.display='flex';document.getElementById('panel-gtm').style.display='none';document.getElementById('tab-wp').style.background='#7C3AED';document.getElementById('tab-wp').style.color='#fff';document.getElementById('tab-gtm').style.background='rgba(124,58,237,.12)';document.getElementById('tab-gtm').style.color='#C4B5FD';"
              style="flex:1;padding:8px;border-radius:8px;border:1px solid rgba(124,58,237,.3);background:rgba(124,58,237,.12);color:#C4B5FD;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">
              ⊞ Direto no WordPress
            </button>
          </div>

          <!-- PAINEL GTM -->
          <div id="panel-gtm" style="display:flex;flex-direction:column;gap:10px">
            \${step(1,'#7C3AED','Acesse <strong style="color:#E8EAFF">tagmanager.google.com</strong> → entre no container do seu site → <strong style="color:#E8EAFF">Tags → Nova</strong>')}
            \${step(2,'#7C3AED','Em <strong style="color:#E8EAFF">Configuração da tag</strong>, escolha <strong style="color:#E8EAFF">HTML personalizado</strong> e cole o código abaixo')}
            \${step(3,'#7C3AED','Em <strong style="color:#E8EAFF">Acionadores → Novo</strong>: tipo <strong style="color:#E8EAFF">Visualização de página</strong> → <em>Algumas visualizações de página</em> → condição: <strong style="color:#E8EAFF">URL da página contém</strong> → cole o caminho da sua landing page (ex: <code style="background:rgba(124,58,237,.15);color:#C4B5FD;padding:1px 5px;border-radius:3px">frequencia-ativa</code>)')}
            \${step(4,'#7C3AED','Nomeie a tag (ex: <em>UTM Janus FA3</em>), salve e clique em <strong style="color:#E8EAFF">Enviar → Publicar</strong>')}
            \${step(5,'#EC4899','No <strong style="color:#E8EAFF">Elementor</strong>, abra o formulário → <strong style="color:#E8EAFF">Actions After Submit → Redirect</strong> → <strong style="color:#E8EAFF">apague a URL</strong> que está lá. O código faz o redirect com as UTMs.')}
            \${step('✓','#10B981','Teste: acesse a landing com <code style="background:rgba(16,185,129,.1);color:#6EE7B7;padding:1px 5px;border-radius:3px">?utm_source=teste</code>, envie o form e veja se o Hotmart recebeu o parâmetro na URL final.')}
          </div>

          <!-- PAINEL WORDPRESS DIRETO -->
          <div id="panel-wp" style="display:none;flex-direction:column;gap:10px">
            \${step(1,'#7C3AED','<strong style="color:#E8EAFF">Opção A — GTM (recomendado):</strong> use a aba ao lado')}
            \${step(2,'#7C3AED','<strong style="color:#E8EAFF">Opção B — Widget HTML:</strong> no editor Elementor da página, busque o widget <strong style="color:#E8EAFF">HTML</strong>, arraste para a página e cole o código abaixo')}
            \${step(3,'#7C3AED','<strong style="color:#E8EAFF">Opção C — Plugin Code Snippets:</strong> WordPress → Plugins → Adicionar novo → busque <em>Code Snippets</em> → instale → Snippets → Adicionar novo → cole o código <strong style="color:#E8EAFF">sem</strong> as tags &lt;script&gt; → localização: <em>Somente front-end</em>')}
            \${step(4,'#EC4899','No <strong style="color:#E8EAFF">Elementor</strong>, abra o formulário → <strong style="color:#E8EAFF">Actions After Submit → Redirect</strong> → <strong style="color:#E8EAFF">apague a URL</strong>. O código faz o redirect com as UTMs.')}
            \${step('✓','#10B981','Teste com <code style="background:rgba(16,185,129,.1);color:#6EE7B7;padding:1px 5px;border-radius:3px">?utm_source=teste</code> na URL da landing page.')}
          </div>
        </div>

        <!-- CAPTURA DE LEADS -->
        <div style="background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.25);border-radius:8px;padding:14px 16px">
          <div style="font-size:11px;font-weight:600;color:#6EE7B7;margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">+ Salvar leads no Janus (opcional)</div>
          <div style="font-size:12px;color:#A7F3D0;line-height:1.6;margin-bottom:10px">
            O Elementor já tem a ação <strong>Webhook</strong> no seu formulário. Cole a URL abaixo nela — os dados de nome, e-mail e telefone serão salvos automaticamente em <strong>Leads Capturados</strong> no Janus.
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <code id="webhook-url-display" style="flex:1;background:#080B1A;border:1px solid #1E2448;border-radius:6px;padding:8px 10px;font-size:11px;color:#6EE7B7;font-family:monospace;word-break:break-all">${esc(webhookUrl)}</code>
            <button onclick="navigator.clipboard.writeText('${esc(webhookUrl)}').then(function(){var b=document.getElementById('wh-copy-btn');b.textContent='Copiado ✓';setTimeout(function(){b.textContent='Copiar';},2000);})"
              id="wh-copy-btn" style="white-space:nowrap;background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.3);color:#6EE7B7;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;flex-shrink:0">Copiar</button>
          </div>
          <div style="font-size:11px;color:#6EE7B7;margin-top:8px;opacity:.7">
            No Elementor: <strong>Actions After Submit → Webhook → cole a URL acima</strong>. Certifique-se de que seus campos têm ID ou tipo configurados (email, tel, text).
          </div>
        </div>

        <!-- SNIPPET UTM -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-size:12px;font-weight:600;color:#7B85B0;text-transform:uppercase;letter-spacing:.06em">Código para repassar UTMs (GTM / WordPress)</div>
            <button onclick="navigator.clipboard.writeText(document.getElementById('wp-snippet-code').textContent).then(function(){var b=document.getElementById('wp-copy-btn');b.textContent='Copiado ✓';setTimeout(function(){b.textContent='Copiar';},2000);})"
              id="wp-copy-btn" style="background:rgba(124,58,237,.15);border:1px solid rgba(124,58,237,.3);color:#C4B5FD;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Copiar</button>
          </div>
          <pre id="wp-snippet-code" style="background:#080B1A;border:1px solid #1E2448;border-radius:8px;padding:14px;font-size:11px;color:#A5B4FC;font-family:monospace;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;margin:0;line-height:1.6">${esc(snippet)}</pre>
        </div>

      </div>
    \`);
  },

  /* ─── Campaign CRUD ──────────────────────────────────────────── */
  openCreateCampaign() {
    Modal.open('Nova Campanha', `
      <form id="modal-form">
        <div class="field">
          <label>Nome *</label>
          <input type="text" id="f-camp-name" placeholder="Black Friday 2025" required autofocus>
        </div>
        <div class="field">
          <label>Descrição</label>
          <textarea id="f-camp-desc" placeholder="Descrição opcional..." rows="3"></textarea>
        </div>
      </form>`,
      () => Pages.submitCampaign(),
      'Criar Campanha'
    );
  },

  async submitCampaign() {
    const name        = document.getElementById('f-camp-name')?.value?.trim();
    const description = document.getElementById('f-camp-desc')?.value?.trim();
    if (!name) { toast('Nome é obrigatório', 'error'); return; }
    try {
      await API.post('/campaigns', { name, description });
      Cache.del('/campaigns');
      toast('Campanha criada!');
      Modal.close();
      await Pages.loadCampaigns();
    } catch (e) { toast(e.message, 'error'); }
  },

  async deleteCampaign(id, name) {
    if (!confirm(`Excluir a campanha "${name}"?\n\nOs links vinculados serão mantidos (sem campanha).`)) return;
    try {
      await API.del(`/campaigns/${id}`);
      Cache.del('/campaigns');
      toast('Campanha excluída');
      await Pages.loadCampaigns();
    } catch (e) { toast(e.message, 'error'); }
  },

  /* REFERRAL PROGRAMS */
  async referralPrograms() {
    document.getElementById('page-content').innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <div class="page-title">Indicações</div>
            <div class="page-sub">Programas Member Get Member e convites</div>
          </div>
        </div>

        <div style="display:flex;border-bottom:2px solid var(--border);margin-bottom:16px">
          <button id="tab-btn-programs"
            style="padding:8px 20px;background:none;border:none;border-bottom:2px solid #7C3AED;color:#E8EAFF;font-weight:600;cursor:pointer;margin-bottom:-2px;font-size:14px;font-family:inherit"
            onclick="Pages.switchReferralTab('programs')">Programas</button>
          <button id="tab-btn-convites"
            style="padding:8px 20px;background:none;border:none;border-bottom:2px solid transparent;color:#7B85B0;font-weight:500;cursor:pointer;margin-bottom:-2px;font-size:14px;font-family:inherit"
            onclick="Pages.switchReferralTab('convites')">Convites</button>
        </div>

        <div id="tab-programs">
          <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
            <button class="btn btn-primary" style="width:auto" onclick="Pages.openCreateProgram()">
              <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              Novo Programa
            </button>
          </div>
          <div class="card" style="padding:0">
            <div id="programs-wrap"><div class="empty-state"><p>Carregando...</p></div></div>
          </div>
        </div>

        <div id="tab-convites" style="display:none">
          <div class="toolbar">
            <select class="filter-select" id="ref-prog-filter" onchange="Pages.loadReferralsTab()" style="min-width:220px">
              <option value="">Todos os programas</option>
            </select>
          </div>
          <div class="stats-grid" id="ref-stats-grid" style="margin-bottom:16px"></div>
          <div class="card" style="padding:0">
            <div id="referrals-wrap"><div class="empty-state"><p>Carregando...</p></div></div>
          </div>
        </div>
      </div>`;

    document.getElementById('programs-wrap').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, name, slug, active } = btn.dataset;
      const origin = window.location.origin;
      if (action === 'copy-link') copyLink(`${origin}/indica/${slug}`);
      if (action === 'toggle-prog') Pages.toggleProgram(id, active === 'true');
      if (action === 'delete-prog') Pages.deleteProgram(id, name);
      if (action === 'edit-prog') Pages.openEditProgram(id);
      if (action === 'view-convites') Pages.switchReferralTab('convites', id);
    });

    await Pages.loadPrograms();
  },

  switchReferralTab(tab, programId) {
    const isPrograms = tab === 'programs';
    document.getElementById('tab-programs').style.display = isPrograms ? '' : 'none';
    document.getElementById('tab-convites').style.display = isPrograms ? 'none' : '';
    const active = 'padding:8px 20px;background:none;border:none;border-bottom:2px solid #7C3AED;color:#E8EAFF;font-weight:600;cursor:pointer;margin-bottom:-2px;font-size:14px;font-family:inherit';
    const inactive = 'padding:8px 20px;background:none;border:none;border-bottom:2px solid transparent;color:#7B85B0;font-weight:500;cursor:pointer;margin-bottom:-2px;font-size:14px;font-family:inherit';
    document.getElementById('tab-btn-programs').style.cssText = isPrograms ? active : inactive;
    document.getElementById('tab-btn-convites').style.cssText = isPrograms ? inactive : active;
    if (!isPrograms) {
      if (programId) {
        const sel = document.getElementById('ref-prog-filter');
        if (sel) sel.value = programId;
      }
      Pages.loadReferralsTab();
    }
  },

  async loadPrograms() {
    const wrap = document.getElementById('programs-wrap');
    if (!wrap) return;
    const origin = window.location.origin;
    try {
      const programs = await API.get('/referral-programs');

      const sel = document.getElementById('ref-prog-filter');
      if (sel && programs?.length) {
        sel.innerHTML = '<option value="">Todos os programas</option>';
        programs.forEach(p => {
          const o = document.createElement('option');
          o.value = p.id; o.textContent = p.name;
          sel.appendChild(o);
        });
      }

      if (!programs?.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="icon">🤝</div><p>Nenhum programa criado ainda</p></div>`;
        return;
      }
      wrap.innerHTML = `
        <div class="table-wrap"><table>
          <thead>
            <tr><th>Programa</th><th>Link de Indicação</th><th>Convites</th><th>Confirmados</th><th>Status</th><th>Ações</th></tr>
          </thead>
          <tbody>
            ${programs.map(p => `
              <tr>
                <td><strong>${esc(p.name)}</strong></td>
                <td>
                  <div class="slug-cell">/indica/${esc(p.slug)}</div>
                  <button class="btn btn-secondary btn-sm" style="margin-top:4px"
                          data-action="copy-link" data-slug="${esc(p.slug)}">Copiar Link</button>
                </td>
                <td>${p.total_referrals ?? 0}</td>
                <td>
                  <span class="badge badge-green">${p.claimed_count ?? 0} confirmados</span>
                  <span class="badge badge-violet" style="margin-left:4px">${p.pending_count ?? 0} pendentes</span>
                </td>
                <td>
                  ${p.active
                    ? '<span class="badge badge-green">Ativo</span>'
                    : '<span class="badge badge-red">Inativo</span>'}
                </td>
                <td>
                  <div class="actions">
                    <button class="btn btn-secondary btn-sm" data-action="view-convites" data-id="${esc(p.id)}"
                            title="Ver convites deste programa">Convites</button>
                    <button class="btn-icon" title="Editar"
                            data-action="edit-prog" data-id="${esc(p.id)}">
                      <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    </button>
                    <button class="btn-icon" title="${p.active ? 'Desativar' : 'Ativar'}"
                            data-action="toggle-prog" data-id="${esc(p.id)}" data-active="${p.active}">
                      <svg viewBox="0 0 24 24"><path d="${p.active
                        ? 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z'
                        : 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z'}"/></svg>
                    </button>
                    <button class="btn-icon danger" title="Excluir"
                            data-action="delete-prog" data-id="${esc(p.id)}" data-name="${esc(p.name)}">
                      <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table></div>`;
    } catch (e) { toast(e.message, 'error'); }
  },

  openCreateProgram() {
    Modal.open('Novo Programa de Indicação', `
      <form id="modal-form">
        <div class="field">
          <label>Nome do Programa *</label>
          <input type="text" id="f-prog-name" placeholder="Frequência Ativa — Turma 2025" required autofocus>
        </div>
        <div class="field">
          <label>Slug (URL: /indica/SLUG) *</label>
          <input type="text" id="f-prog-slug" placeholder="frequencia-ativa" required>
          <p class="field-hint">Apenas letras minúsculas, números e hífens. Ex: frequencia-ativa</p>
        </div>

        <div class="toggle-row" style="margin:16px 0 8px">
          <div>
            <div class="toggle-label">Redirecionar após confirmação</div>
            <div class="toggle-sub">Envia o convidado para um link (ex: grupo do WhatsApp) automaticamente</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="f-prog-redirect-toggle" onchange="Pages.toggleRedirectField(this.checked)">
            <span class="slider"></span>
          </label>
        </div>
        <div id="f-prog-redirect-wrap" style="display:none">
          <div class="field">
            <label>URL de Destino (após confirmação)</label>
            <input type="url" id="f-prog-group" placeholder="https://chat.whatsapp.com/...">
          </div>
        </div>

        <div class="toggle-row" style="margin:16px 0 8px">
          <div>
            <div class="toggle-label">Enviar para API / Webhook</div>
            <div class="toggle-sub">Dispara um POST com os dados do convidado ao confirmar a vaga</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="f-prog-webhook-toggle" onchange="Pages.toggleWebhookField(this.checked)">
            <span class="slider"></span>
          </label>
        </div>
        <div id="f-prog-webhook-wrap" style="display:none">
          <div class="field">
            <label>URL do Webhook</label>
            <input type="url" id="f-prog-webhook" placeholder="https://hook.make.com/... ou https://n8n.io/webhook/...">
            <p class="field-hint">Recebe um POST JSON com: event, program, claimed, referrer, invite_code.</p>
          </div>
        </div>

        <div class="toggle-row" style="margin:16px 0 8px">
          <div>
            <div class="toggle-label">Limitar indicações por pessoa</div>
            <div class="toggle-sub">Bloqueia o indicador após N convites (verificado pelo telefone)</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="f-prog-limit-toggle" onchange="Pages.toggleLimitField(this.checked)">
            <span class="slider"></span>
          </label>
        </div>
        <div id="f-prog-limit-wrap" style="display:none">
          <div class="field">
            <label>Máximo de indicações por indicador</label>
            <input type="number" id="f-prog-limit" min="1" max="1000" placeholder="Ex: 3">
            <p class="field-hint">O indicador será bloqueado após atingir este número de convites enviados.</p>
          </div>
        </div>

        <div class="settings-section-label" style="margin-top:16px">UTM Parameters <span style="font-weight:400;opacity:.6">(opcionais — embutidos no redirect final)</span></div>
        <div class="field-row">
          <div class="field"><label>utm_source</label><input type="text" id="f-utm_source" placeholder="indica"></div>
          <div class="field"><label>utm_medium</label><input type="text" id="f-utm_medium" placeholder="mgm"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>utm_campaign</label><input type="text" id="f-utm_campaign" placeholder="frequencia-ativa"></div>
          <div class="field"><label>utm_term</label><input type="text" id="f-utm_term"></div>
        </div>
        <div class="field"><label>utm_content</label><input type="text" id="f-utm_content"></div>

        <div class="toggle-row" style="margin:16px 0 8px">
          <div>
            <div class="toggle-label">Personalização visual</div>
            <div class="toggle-sub">Logo, cores e textos personalizados na página de indicação</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="f-prog-brand-toggle" onchange="Pages.toggleBrandFields(this.checked)">
            <span class="slider"></span>
          </label>
        </div>
        <div id="f-prog-brand-wrap" style="display:none">
          <div class="field">
            <label>Logo</label>
            <input type="text" id="f-brand-logo" placeholder="https://exemplo.com/logo.png">
            <div style="margin-top:6px;display:flex;align-items:center;gap:10px">
              <label style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;color:var(--text-2)">
                <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                Fazer upload
                <input type="file" accept="image/*" style="display:none" onchange="Pages.handleLogoUpload(this)">
              </label>
              <span id="f-brand-logo-preview" style="font-size:11px;color:var(--text-2)"></span>
            </div>
            <p class="field-hint">URL externa ou upload direto (max 500 KB). JPG, PNG, SVG, WebP.</p>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Cor Primária</label>
              <input type="text" id="f-brand-primary" placeholder="#7C3AED">
            </div>
            <div class="field">
              <label>Cor Secundária</label>
              <input type="text" id="f-brand-secondary" placeholder="#EC4899">
            </div>
          </div>
          <div class="field">
            <label>Título do Formulário</label>
            <input type="text" id="f-brand-title" placeholder="Indique um amigo">
          </div>
          <div class="field">
            <label>Subtítulo</label>
            <input type="text" id="f-brand-subtitle" placeholder="Seus amigos vão adorar!">
          </div>
        </div>
      </form>`,
      () => Pages.submitProgram(null),
      'Criar Programa'
    );
  },

  toggleRedirectField(on) {
    document.getElementById('f-prog-redirect-wrap').style.display = on ? 'block' : 'none';
    const input = document.getElementById('f-prog-group');
    if (input) { input.required = on; if (!on) input.value = ''; }
  },

  toggleWebhookField(on) {
    document.getElementById('f-prog-webhook-wrap').style.display = on ? 'block' : 'none';
    const input = document.getElementById('f-prog-webhook');
    if (input && !on) input.value = '';
  },

  toggleBrandFields(on) {
    document.getElementById('f-prog-brand-wrap').style.display = on ? 'block' : 'none';
  },

  toggleLimitField(on) {
    document.getElementById('f-prog-limit-wrap').style.display = on ? 'block' : 'none';
    const input = document.getElementById('f-prog-limit');
    if (input && !on) input.value = '';
  },

  handleLogoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast('Imagem muito grande. Máximo 500 KB.', 'error');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const logoInput = document.getElementById('f-brand-logo');
      const preview   = document.getElementById('f-brand-logo-preview');
      if (logoInput) logoInput.value = e.target.result;
      if (preview) preview.textContent = `✓ ${file.name}`;
    };
    reader.readAsDataURL(file);
  },

  async openEditProgram(id) {
    try {
      const p = await API.get(`/referral-programs/${id}`);
      if (!p) return;
      const hasRedirect = !!p.group_redirect_url;
      const hasWebhook  = !!p.webhook_url;
      const utm = p.utm_parameters || {};
      const hasBrand = !!(p.brand_logo_url || p.brand_primary_color || p.brand_secondary_color || p.form_title || p.form_subtitle);
      const hasLimit = !!p.max_referrals_per_referrer;

      Modal.open('Editar Programa', `
        <form id="modal-form">
          <div class="field">
            <label>Nome do Programa *</label>
            <input type="text" id="f-prog-name" value="${esc(p.name)}" required>
          </div>
          <div class="field">
            <label>Slug (somente leitura)</label>
            <input type="text" value="${esc(p.slug)}" readonly style="opacity:.5;cursor:not-allowed">
          </div>

          <div class="toggle-row" style="margin:16px 0 8px">
            <div>
              <div class="toggle-label">Redirecionar após confirmação</div>
              <div class="toggle-sub">Envia o convidado para um link automaticamente</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="f-prog-redirect-toggle" ${hasRedirect ? 'checked' : ''}
                     onchange="Pages.toggleRedirectField(this.checked)">
              <span class="slider"></span>
            </label>
          </div>
          <div id="f-prog-redirect-wrap" style="display:${hasRedirect ? 'block' : 'none'}">
            <div class="field">
              <label>URL de Destino</label>
              <input type="url" id="f-prog-group" value="${esc(p.group_redirect_url || '')}">
            </div>
          </div>

          <div class="toggle-row" style="margin:16px 0 8px">
            <div>
              <div class="toggle-label">Enviar para API / Webhook</div>
              <div class="toggle-sub">Dispara um POST com os dados do convidado</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="f-prog-webhook-toggle" ${hasWebhook ? 'checked' : ''}
                     onchange="Pages.toggleWebhookField(this.checked)">
              <span class="slider"></span>
            </label>
          </div>
          <div id="f-prog-webhook-wrap" style="display:${hasWebhook ? 'block' : 'none'}">
            <div class="field">
              <label>URL do Webhook</label>
              <input type="url" id="f-prog-webhook" value="${esc(p.webhook_url || '')}">
            </div>
          </div>

          <div class="toggle-row" style="margin:16px 0 8px">
            <div>
              <div class="toggle-label">Limitar indicações por pessoa</div>
              <div class="toggle-sub">Bloqueia o indicador após N convites (verificado pelo telefone)</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="f-prog-limit-toggle" ${hasLimit ? 'checked' : ''}
                     onchange="Pages.toggleLimitField(this.checked)">
              <span class="slider"></span>
            </label>
          </div>
          <div id="f-prog-limit-wrap" style="display:${hasLimit ? 'block' : 'none'}">
            <div class="field">
              <label>Máximo de indicações por indicador</label>
              <input type="number" id="f-prog-limit" min="1" max="1000"
                     value="${p.max_referrals_per_referrer || ''}" placeholder="Ex: 3">
              <p class="field-hint">O indicador será bloqueado após atingir este número de convites enviados.</p>
            </div>
          </div>

          <div class="settings-section-label" style="margin-top:16px">UTM Parameters <span style="font-weight:400;opacity:.6">(opcionais — embutidos no redirect final)</span></div>
          <div class="field-row">
            <div class="field"><label>utm_source</label><input type="text" id="f-utm_source" value="${esc(utm.utm_source || '')}" placeholder="indica"></div>
            <div class="field"><label>utm_medium</label><input type="text" id="f-utm_medium" value="${esc(utm.utm_medium || '')}" placeholder="mgm"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>utm_campaign</label><input type="text" id="f-utm_campaign" value="${esc(utm.utm_campaign || '')}" placeholder=""></div>
            <div class="field"><label>utm_term</label><input type="text" id="f-utm_term" value="${esc(utm.utm_term || '')}" placeholder=""></div>
          </div>
          <div class="field"><label>utm_content</label><input type="text" id="f-utm_content" value="${esc(utm.utm_content || '')}" placeholder=""></div>

          <div class="toggle-row" style="margin:16px 0 8px">
            <div>
              <div class="toggle-label">Personalização visual</div>
              <div class="toggle-sub">Logo, cores e textos personalizados na página de indicação</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="f-prog-brand-toggle" ${hasBrand ? 'checked' : ''}
                     onchange="Pages.toggleBrandFields(this.checked)">
              <span class="slider"></span>
            </label>
          </div>
          <div id="f-prog-brand-wrap" style="display:${hasBrand ? 'block' : 'none'}">
            <div class="field">
              <label>Logo</label>
              <input type="text" id="f-brand-logo" value="${esc(p.brand_logo_url || '')}" placeholder="https://...">
              <div style="margin-top:6px;display:flex;align-items:center;gap:10px">
                <label style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;color:var(--text-2)">
                  <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                  Fazer upload
                  <input type="file" accept="image/*" style="display:none" onchange="Pages.handleLogoUpload(this)">
                </label>
                <span id="f-brand-logo-preview" style="font-size:11px;color:var(--text-2)">
                  ${p.brand_logo_url ? (p.brand_logo_url.startsWith('data:') ? '✓ Imagem salva' : '') : ''}
                </span>
              </div>
              <p class="field-hint">URL externa ou upload direto (max 500 KB). JPG, PNG, SVG, WebP.</p>
            </div>
            <div class="field-row">
              <div class="field">
                <label>Cor Primária</label>
                <input type="text" id="f-brand-primary" value="${esc(p.brand_primary_color || '')}" placeholder="#7C3AED">
              </div>
              <div class="field">
                <label>Cor Secundária</label>
                <input type="text" id="f-brand-secondary" value="${esc(p.brand_secondary_color || '')}" placeholder="#EC4899">
              </div>
            </div>
            <div class="field">
              <label>Título do Formulário</label>
              <input type="text" id="f-brand-title" value="${esc(p.form_title || '')}" placeholder="Indique um amigo">
            </div>
            <div class="field">
              <label>Subtítulo</label>
              <input type="text" id="f-brand-subtitle" value="${esc(p.form_subtitle || '')}" placeholder="">
            </div>
          </div>
        </form>`,
        () => Pages.submitProgram(id),
        'Salvar'
      );
    } catch (e) { toast(e.message, 'error'); }
  },

  async submitProgram(id) {
    const name    = document.getElementById('f-prog-name')?.value?.trim();
    const slug    = document.getElementById('f-prog-slug')?.value?.trim();
    const group   = document.getElementById('f-prog-group')?.value?.trim() || '';
    const webhook = document.getElementById('f-prog-webhook')?.value?.trim() || '';
    const redirectOn = document.getElementById('f-prog-redirect-toggle')?.checked;

    if (!name) { toast('Nome é obrigatório', 'error'); return; }
    if (redirectOn && !group) { toast('Informe a URL de destino do redirecionamento', 'error'); return; }

    const utmParams = {};
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(k => {
      const v = document.getElementById(`f-${k}`)?.value?.trim();
      if (v) utmParams[k] = v;
    });

    const limitOn  = document.getElementById('f-prog-limit-toggle')?.checked;
    const limitVal = document.getElementById('f-prog-limit')?.value?.trim();

    const payload = {
      name,
      group_redirect_url:          redirectOn ? group : '',
      webhook_url:                  webhook,
      utm_parameters:               utmParams,
      brand_logo_url:               document.getElementById('f-brand-logo')?.value     || '',
      brand_primary_color:          document.getElementById('f-brand-primary')?.value?.trim()  || '',
      brand_secondary_color:        document.getElementById('f-brand-secondary')?.value?.trim()|| '',
      form_title:                   document.getElementById('f-brand-title')?.value?.trim()    || '',
      form_subtitle:                document.getElementById('f-brand-subtitle')?.value?.trim() || '',
      max_referrals_per_referrer:   limitOn && limitVal ? parseInt(limitVal) : null,
    };

    try {
      if (id) {
        await API.put(`/referral-programs/${id}`, payload);
      } else {
        if (!slug) { toast('Slug é obrigatório', 'error'); return; }
        await API.post('/referral-programs', { ...payload, slug });
      }
      Cache.del('/referral-programs');
      toast(id ? 'Programa atualizado!' : 'Programa criado!');
      Modal.close();
      await Pages.loadPrograms();
    } catch (e) { toast(e.message, 'error'); }
  },

  async toggleProgram(id, currentlyActive) {
    try {
      await API.put(`/referral-programs/${id}`, { active: !currentlyActive });
      Cache.del('/referral-programs');
      toast(currentlyActive ? 'Programa desativado' : 'Programa ativado');
      await Pages.loadPrograms();
    } catch (e) { toast(e.message, 'error'); }
  },

  async deleteProgram(id, name) {
    if (!confirm(`Excluir o programa "${name}"?\n\nTodos os convites vinculados serão perdidos.`)) return;
    try {
      await API.del(`/referral-programs/${id}`);
      Cache.del('/referral-programs');
      toast('Programa excluído');
      await Pages.loadPrograms();
    } catch (e) { toast(e.message, 'error'); }
  },

  async loadReferralsTab() {
    const wrap = document.getElementById('referrals-wrap');
    const statsGrid = document.getElementById('ref-stats-grid');
    if (!wrap) return;

    const progId = document.getElementById('ref-prog-filter')?.value || '';
    const qs = progId ? `?program_id=${progId}` : '';

    try {
      const rows = await API.get(`/referrals${qs}`);

      if (statsGrid) {
        const total   = rows?.length ?? 0;
        const claimed = rows?.filter(r => r.status === 'claimed').length ?? 0;
        const pending = rows?.filter(r => r.status === 'pending').length ?? 0;
        statsGrid.innerHTML = `
          <div class="stat-card">
            <div class="stat-label">Total de Convites</div>
            <div class="stat-value violet">${total}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Confirmados</div>
            <div class="stat-value green">${claimed}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Pendentes</div>
            <div class="stat-value">${pending}</div>
          </div>`;
      }

      if (!rows?.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="icon">🎟️</div><p>Nenhum convite enviado ainda</p></div>`;
        return;
      }

      wrap.innerHTML = `
        <div class="table-wrap"><table>
          <thead>
            <tr>
              <th>Data</th><th>Programa</th>
              <th>Indicador</th><th>Convidado</th><th>Confirmado por</th>
              <th>Código</th><th>WhatsApp</th><th>Status</th><th>UTMs</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const utm = r.utm_data || {};
              const utmStr = Object.entries(utm).filter(([,v]) => v).map(([k,v]) => `${k.replace('utm_','')}=${esc(v)}`).join(' · ');
              return `
              <tr>
                <td class="text-sm">${new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
                <td><span class="badge badge-blue">${esc(r.program_name)}</span></td>
                <td>
                  <div>${esc(r.referrer_name)}</div>
                  <div class="text-muted text-sm">${esc(r.referrer_phone)}</div>
                  ${r.referrer_email ? `<div class="text-muted text-sm">${esc(r.referrer_email)}</div>` : ''}
                </td>
                <td>
                  <div>${esc(r.invited_name)}</div>
                  <div class="text-muted text-sm">${esc(r.invited_phone)}</div>
                </td>
                <td>
                  ${r.claimed_name ? `
                    <div>${esc(r.claimed_name)}</div>
                    <div class="text-muted text-sm">${esc(r.claimed_email || '')}</div>
                    <div class="text-muted text-sm">${esc(r.claimed_phone || '')}</div>
                    <div class="text-muted text-sm">${r.claimed_at ? new Date(r.claimed_at).toLocaleDateString('pt-BR') : ''}</div>
                  ` : '<span class="text-muted text-sm">—</span>'}
                </td>
                <td><code style="font-size:12px;color:#C4B5FD">${esc(r.invite_code)}</code></td>
                <td>
                  ${r.whatsapp_sent
                    ? '<span class="badge badge-green">Enviado</span>'
                    : '<span class="badge badge-red">Não enviado</span>'}
                </td>
                <td>
                  ${r.status === 'claimed'
                    ? '<span class="badge badge-green">Confirmado</span>'
                    : '<span class="badge badge-violet">Pendente</span>'}
                </td>
                <td class="text-sm text-muted">${utmStr || '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>`;
    } catch (e) { toast(e.message, 'error'); }
  },

  /* SETTINGS */
  async settings() {
    const hotmartUrl = `${window.location.origin}/webhooks/hotmart`;
    const leadsUrl   = `${window.location.origin}/webhooks/leads`;

    document.getElementById('page-content').innerHTML = `
      <div class="page">
        <div class="page-header">
          <div>
            <div class="page-title">Configurações</div>
            <div class="page-sub">Integrações e dados capturados</div>
          </div>
        </div>

        <div class="settings-grid">

          <!-- ── META ADS ───────────────────────── -->
          <div class="card">
            <div class="card-title">Meta Ads — Conversions API</div>
            <div id="meta-status" class="settings-status-row"></div>
            <form id="meta-form" class="creds-form">
              <div class="field-row">
                <div class="field">
                  <label>Pixel ID</label>
                  <input type="text" id="s-pixel-id" placeholder="123456789012345">
                </div>
                <div class="field">
                  <label>Test Event Code <span class="field-hint-inline">(opcional)</span></label>
                  <input type="text" id="s-test-code" placeholder="TEST12345">
                </div>
              </div>
              <div class="field">
                <label>Access Token do Sistema</label>
                <input type="password" id="s-access-token" placeholder="EAABxx... (deixe em branco para não alterar)">
                <p class="field-hint">Gere em: Meta Business Manager → Configurações → Usuários do sistema → Gerar token</p>
              </div>
              <div class="field" style="margin-top:4px">
                <button type="button" class="btn btn-primary" onclick="Pages.saveMetaSettings()">Salvar Meta Ads</button>
              </div>
            </form>
          </div>

          <!-- ── HOTMART ───────────────────────── -->
          <div class="card">
            <div class="card-title">Hotmart</div>
            <div id="hotmart-status" class="settings-status-row"></div>
            <form id="hotmart-form" class="creds-form">
              <div class="field">
                <label>Hottok (segredo do webhook)</label>
                <input type="password" id="s-hotmart-secret" placeholder="(deixe em branco para não alterar)">
                <p class="field-hint">Copie do painel Hotmart → Ferramentas → Webhooks</p>
              </div>
              <div class="field" style="margin-top:4px">
                <button type="button" class="btn btn-primary" onclick="Pages.saveHotmartSettings()">Salvar Hotmart</button>
              </div>
            </form>
          </div>

          <!-- ── WHATSAPP / CANAIS ───────────────────────── -->
          <div class="card">
            <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
              <span>WhatsApp — Canais Evolution API</span>
              <button class="btn btn-primary btn-sm" style="width:auto" onclick="Pages.openAddInstance()">
                <svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                Adicionar Canal
              </button>
            </div>
            <div id="instances-wrap" style="margin-top:12px">
              <div class="empty-state"><p>Carregando...</p></div>
            </div>
          </div>

          <!-- ── URLs DOS WEBHOOKS ──────────────────── -->
          <div class="card">
            <div class="card-title">URLs dos Webhooks</div>
            <div class="integrations-list">
              <div class="integration-row">
                <div style="flex:1">
                  <div class="int-name">Hotmart — Compras</div>
                  <div class="webhook-url-box">
                    <code>${esc(hotmartUrl)}</code>
                    <button class="btn btn-secondary btn-sm" onclick="copyLink('${esc(hotmartUrl)}')">Copiar</button>
                  </div>
                  <p class="field-hint">Configure em: Hotmart → Ferramentas → Webhooks → Nova URL</p>
                </div>
              </div>
              <div class="integration-row">
                <div style="flex:1">
                  <div class="int-name">Captura de Leads / Email</div>
                  <div class="webhook-url-box">
                    <code>${esc(leadsUrl)}</code>
                    <button class="btn btn-secondary btn-sm" onclick="copyLink('${esc(leadsUrl)}')">Copiar</button>
                  </div>
                  <p class="field-hint">
                    POST JSON: <code>{"email":"...","name":"...","phone":"...","source":"landing-1"}</code>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- ── VENDAS RECEBIDAS ───────────────────── -->
          <div class="card">
            <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
              <span>Vendas Recebidas (Hotmart)</span>
              <div style="display:flex;gap:6px">
                <button class="btn btn-secondary btn-sm" onclick="downloadCSV('sales')">
                  <svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                  CSV
                </button>
                <button class="btn btn-secondary btn-sm" onclick="Pages.loadWebhookEvents()">Atualizar</button>
              </div>
            </div>
            <div id="webhook-events-wrap"><div class="empty-state"><p>Carregando...</p></div></div>
          </div>

          <!-- ── LEADS CAPTURADOS ───────────────────── -->
          <div class="card">
            <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
              <span>Leads Capturados</span>
              <div style="display:flex;gap:6px">
                <button class="btn btn-secondary btn-sm" onclick="downloadCSV('leads')">
                  <svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                  CSV
                </button>
                <button class="btn btn-secondary btn-sm" onclick="Pages.loadLeads()">Atualizar</button>
              </div>
            </div>
            <div id="leads-wrap"><div class="empty-state"><p>Carregando...</p></div></div>
          </div>

        </div>
      </div>`;

    await Promise.all([
      Pages.loadSettingsForm(),
      Pages.loadInstances(),
      Pages.loadWebhookEvents(),
      Pages.loadLeads(),
    ]);
  },

  async loadSettingsForm() {
    try {
      const s = await API.get('/settings');
      if (!s) return;
      document.getElementById('s-pixel-id').value  = s.meta_pixel_id || '';
      document.getElementById('s-test-code').value = s.meta_test_event_code || '';
      document.getElementById('s-access-token').placeholder =
        s.meta_access_token ? `Token atual: ${s.meta_access_token} — deixe vazio para manter` : 'EAABxx...';
      document.getElementById('s-hotmart-secret').placeholder =
        s.hotmart_secret ? `Token atual: ${s.hotmart_secret} — deixe vazio para manter` : 'Hottok do Hotmart';
      document.getElementById('meta-status').innerHTML = `
        <span class="badge ${s.meta_capi_active ? 'badge-green' : 'badge-red'}">
          Meta CAPI: ${s.meta_capi_active ? 'Ativo' : 'Não configurado'}
        </span>`;
      document.getElementById('hotmart-status').innerHTML = `
        <span class="badge ${s.hotmart_active ? 'badge-green' : 'badge-red'}">
          Hotmart: ${s.hotmart_active ? 'Ativo' : 'Sem token'}
        </span>`;
    } catch (e) { toast(e.message, 'error'); }
  },

  async saveMetaSettings() {
    const payload = {
      meta_pixel_id:        document.getElementById('s-pixel-id')?.value?.trim()     || '',
      meta_access_token:    document.getElementById('s-access-token')?.value?.trim() || '',
      meta_test_event_code: document.getElementById('s-test-code')?.value?.trim()    || '',
    };
    try {
      await API.put('/settings', payload);
      Cache.del('/settings');
      toast('Configurações Meta salvas!');
      document.getElementById('s-access-token').value = '';
      await Pages.loadSettingsForm();
    } catch (e) { toast(e.message, 'error'); }
  },

  async saveHotmartSettings() {
    const payload = { hotmart_secret: document.getElementById('s-hotmart-secret')?.value?.trim() || '' };
    try {
      await API.put('/settings', payload);
      Cache.del('/settings');
      toast('Configurações Hotmart salvas!');
      document.getElementById('s-hotmart-secret').value = '';
      await Pages.loadSettingsForm();
    } catch (e) { toast(e.message, 'error'); }
  },

  async loadInstances() {
    const wrap = document.getElementById('instances-wrap');
    if (!wrap) return;
    try {
      const rows = await API.get('/evolution-instances');
      if (!rows?.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="icon">📱</div><p>Nenhum canal configurado ainda</p></div>`;
        return;
      }
      wrap.innerHTML = rows.map(inst => `
        <div class="integration-row" id="inst-row-${esc(inst.id)}" style="align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-weight:600;color:var(--text-1)">${esc(inst.channel_name)}</div>
            ${inst.phone ? `<div class="text-muted text-sm">${esc(inst.phone)}</div>` : ''}
            <div class="text-sm text-muted" style="margin-top:2px">
              <code style="font-size:11px">${esc(inst.instance_name)}</code> · ${esc(inst.api_url)}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span class="badge ${inst.is_connected ? 'badge-green' : 'badge-red'}" id="inst-badge-${esc(inst.id)}">
              ${inst.is_connected ? 'Conectado' : 'Desconectado'}
            </span>
            ${inst.last_checked ? `<div class="text-muted" style="font-size:10px">verificado ${new Date(inst.last_checked).toLocaleString('pt-BR')}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-secondary btn-sm" onclick="Pages.verifyInstance('${esc(inst.id)}')">Verificar</button>
            <button class="btn-icon danger" title="Excluir" onclick="Pages.deleteInstance('${esc(inst.id)}', '${esc(inst.channel_name)}')">
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>`).join('');
    } catch (e) { wrap.innerHTML = `<p class="text-muted" style="padding:12px">${esc(e.message)}</p>`; }
  },

  openAddInstance() {
    Modal.open('Adicionar Canal WhatsApp', `
      <form id="modal-form">
        <div class="field">
          <label>Nome do Canal *</label>
          <input type="text" id="f-inst-name" placeholder="Suporte / Vendas / Principal" required autofocus>
        </div>
        <div class="field">
          <label>Telefone <span class="field-hint-inline">(opcional)</span></label>
          <input type="tel" id="f-inst-phone" placeholder="+55 11 99999-9999">
        </div>
        <div class="field">
          <label>API URL *</label>
          <input type="url" id="f-inst-url" placeholder="https://evo.suaapi.com" required>
        </div>
        <div class="field">
          <label>Nome da Instância *</label>
          <input type="text" id="f-inst-instance" placeholder="meu-numero" required>
        </div>
        <div class="field">
          <label>API Key *</label>
          <input type="text" id="f-inst-key" placeholder="sua-chave-aqui" required>
        </div>
      </form>`,
      () => Pages.saveInstance(),
      'Adicionar Canal'
    );
  },

  async saveInstance() {
    const channel_name  = document.getElementById('f-inst-name')?.value?.trim();
    const phone         = document.getElementById('f-inst-phone')?.value?.trim() || '';
    const api_url       = document.getElementById('f-inst-url')?.value?.trim();
    const instance_name = document.getElementById('f-inst-instance')?.value?.trim();
    const api_key       = document.getElementById('f-inst-key')?.value?.trim();
    if (!channel_name || !api_url || !instance_name || !api_key) {
      toast('Preencha todos os campos obrigatórios', 'error'); return;
    }
    try {
      await API.post('/evolution-instances', { channel_name, phone, api_url, instance_name, api_key });
      Cache.del('/evolution-instances');
      toast('Canal adicionado!');
      Modal.close();
      await Pages.loadInstances();
    } catch (e) { toast(e.message, 'error'); }
  },

  async verifyInstance(id) {
    const badge = document.getElementById(`inst-badge-${id}`);
    if (badge) { badge.textContent = 'Verificando...'; badge.className = 'badge'; }
    try {
      const res = await API.post(`/evolution-instances/${id}/verify`, {});
      Cache.del('/evolution-instances');
      if (badge) {
        badge.className = `badge ${res.is_connected ? 'badge-green' : 'badge-red'}`;
        badge.textContent = res.is_connected ? 'Conectado' : 'Desconectado';
      }
      toast(res.is_connected ? 'Canal conectado!' : 'Canal desconectado');
    } catch (e) {
      if (badge) { badge.className = 'badge badge-red'; badge.textContent = 'Erro'; }
      toast(e.message, 'error');
    }
  },

  async deleteInstance(id, name) {
    if (!confirm(`Excluir o canal "${name}"?`)) return;
    try {
      await API.del(`/evolution-instances/${id}`);
      Cache.del('/evolution-instances');
      toast('Canal excluído');
      await Pages.loadInstances();
    } catch (e) { toast(e.message, 'error'); }
  },

  async loadWebhookEvents() {
    const wrap = document.getElementById('webhook-events-wrap');
    if (!wrap) return;
    try {
      const rows = await API.get('/webhook-events?limit=50');
      if (!rows?.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="icon">🛒</div><p>Nenhuma venda recebida ainda</p></div>`;
        return;
      }
      wrap.innerHTML = `
        <div class="table-wrap"><table>
          <thead><tr><th>Data</th><th>Comprador</th><th>Email</th><th>Valor</th><th>Tipo</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr>
              <td>${new Date(r.received_at).toLocaleString('pt-BR')}</td>
              <td>${esc(r.buyer_name || '—')}</td>
              <td>${esc(r.buyer_email || '—')}</td>
              <td>${r.amount ? `R$ ${parseFloat(r.amount).toFixed(2)}` : '—'}</td>
              <td><span class="badge badge-green">${esc(r.event_type)}</span></td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
    } catch (e) { wrap.innerHTML = `<p class="text-muted" style="padding:16px">${esc(e.message)}</p>`; }
  },

  async loadLeads() {
    const wrap = document.getElementById('leads-wrap');
    if (!wrap) return;
    try {
      const rows = await API.get('/leads?limit=50');
      if (!rows?.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="icon">📧</div><p>Nenhum lead capturado ainda</p></div>`;
        return;
      }
      wrap.innerHTML = `
        <div class="table-wrap"><table>
          <thead><tr><th>Data</th><th>Nome</th><th>Email</th><th>Telefone</th><th>Origem</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr>
              <td>${new Date(r.captured_at).toLocaleString('pt-BR')}</td>
              <td>${esc(r.name || '—')}</td>
              <td>${esc(r.email || '—')}</td>
              <td>${esc(r.phone || '—')}</td>
              <td><span class="badge badge-violet">${esc(r.source || '—')}</span></td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
    } catch (e) { wrap.innerHTML = `<p class="text-muted" style="padding:16px">${esc(e.message)}</p>`; }
  },
};

/* ─── Helpers ─────────────────────────────────────────────────── */
function copyLink(url) {
  navigator.clipboard.writeText(url)
    .then(() => toast('Link copiado!'))
    .catch(() => toast('Falha ao copiar', 'error'));
}

/* ─── App ─────────────────────────────────────────────────────── */
const App = {
  currentPage: 'dashboard',

  init() {
    const token = localStorage.getItem('jet_token');
    if (token) {
      API.token = token;
      this.showApp();
    } else {
      this.showLogin();
    }
  },

  showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.tryLogin(document.getElementById('login-password').value);
    });
  },

  async tryLogin(password) {
    API.token = password;
    try {
      const res = await fetch('/api/analytics/overview', {
        headers: { 'Authorization': `Bearer ${password}` },
      });
      if (res.ok) {
        localStorage.setItem('jet_token', password);
        document.getElementById('login-error').classList.add('hidden');
        this.showApp();
      } else {
        API.token = null;
        document.getElementById('login-error').classList.remove('hidden');
      }
    } catch {
      document.getElementById('login-error').classList.remove('hidden');
    }
  },

  showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    this.navigate('dashboard');
    this.bindNav();
  },

  logout() {
    localStorage.removeItem('jet_token');
    API.token = null;
    location.reload();
  },

  navigate(page, ...args) {
    this.currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    const fn = Pages[page];
    if (fn) fn.call(Pages, ...args);
  },

  bindNav() {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(el.dataset.page);
      });
    });
    document.getElementById('logout-btn').addEventListener('click', () => this.logout());
    document.getElementById('modal-close').addEventListener('click', () => Modal.close());
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-overlay')) Modal.close();
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
