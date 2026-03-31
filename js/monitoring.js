const Monitoring = {
    repo: 'polinacherpovitskaya-glitch/ro-calculator',
    actionsUrl: 'https://github.com/polinacherpovitskaya-glitch/ro-calculator/actions',
    refreshMs: 120000,
    cacheTtlMs: 120000,
    cacheKey: 'ro_monitoring_cache_v1',
    _refreshTimer: null,
    state: {
        loading: false,
        error: '',
        workflows: [],
        fetchedAt: null,
        fromCache: false,
        rateLimitRemaining: null,
        rateLimitResetAt: null,
    },
    workflowMeta: [
        {
            name: 'Deploy GitHub Pages',
            shortLabel: 'Deploy',
            description: 'Публикация GitHub Pages'
        },
        {
            name: 'Live site smoke',
            shortLabel: 'Live smoke',
            description: 'Проверка bugs / warehouse / monitoring на live-сайте'
        },
        {
            name: 'Warehouse stress smoke',
            shortLabel: 'Warehouse stress',
            description: 'Критичные складские и заказные сценарии'
        },
    ],

    load() {
        this.ensureAutoRefresh();
        this.render();
        this.refresh({ force: false }).catch((error) => {
            console.warn('[Monitoring] refresh failed:', error);
        });
    },

    ensureAutoRefresh() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
        }
        this._refreshTimer = setInterval(() => {
            if (typeof App !== 'undefined' && App.currentPage !== 'monitoring') {
                return;
            }
            this.refresh({ force: true, silent: true }).catch((error) => {
                console.warn('[Monitoring] auto refresh failed:', error);
            });
        }, this.refreshMs);
    },

    async forceRefresh() {
        await this.refresh({ force: true });
    },

    async refresh({ force = false, silent = false } = {}) {
        if (this.state.loading) return;

        const cached = !force ? this.readCache() : null;
        if (cached) {
            this.state = {
                ...this.state,
                ...cached,
                loading: false,
                error: '',
                fromCache: true,
            };
            this.render();
        } else if (!silent) {
            this.state.loading = true;
            this.state.error = '';
            this.render();
        }

        try {
            this.state.loading = true;
            this.render();

            const response = await fetch(`https://api.github.com/repos/${this.repo}/actions/runs?per_page=50`, {
                headers: {
                    Accept: 'application/vnd.github+json',
                },
                cache: 'no-store',
            });

            const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
            const rateLimitReset = response.headers.get('x-ratelimit-reset');
            if (!response.ok) {
                throw new Error(`GitHub API ${response.status}`);
            }

            const payload = await response.json();
            const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
            const workflows = this.workflowMeta.map(meta => this.normalizeRun(meta, this.pickLatestRun(meta.name, runs)));

            this.state = {
                loading: false,
                error: '',
                workflows,
                fetchedAt: new Date().toISOString(),
                fromCache: false,
                rateLimitRemaining: rateLimitRemaining != null ? Number(rateLimitRemaining) : null,
                rateLimitResetAt: rateLimitReset ? new Date(Number(rateLimitReset) * 1000).toISOString() : null,
            };
            this.writeCache(this.state);
        } catch (error) {
            const fallback = cached || this.readCache();
            this.state = {
                ...this.state,
                ...(fallback || {}),
                loading: false,
                error: fallback
                    ? `GitHub Actions сейчас не ответил (${error.message}). Показываю сохранённый снимок.`
                    : `GitHub Actions сейчас не ответил (${error.message}).`,
                fromCache: !!fallback,
            };
        } finally {
            this.state.loading = false;
            this.render();
        }
    },

    readCache() {
        try {
            const raw = localStorage.getItem(this.cacheKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed?.fetchedAt) return null;
            const ageMs = Date.now() - new Date(parsed.fetchedAt).getTime();
            if (Number.isNaN(ageMs) || ageMs > this.cacheTtlMs) {
                return null;
            }
            return parsed;
        } catch (error) {
            return null;
        }
    },

    writeCache(snapshot) {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(snapshot));
        } catch (error) {
            console.warn('[Monitoring] cache write failed:', error);
        }
    },

    pickLatestRun(name, runs) {
        const matches = runs
            .filter(run => String(run?.name || '') === String(name))
            .sort((a, b) => {
                const aTime = new Date(a?.created_at || 0).getTime();
                const bTime = new Date(b?.created_at || 0).getTime();
                return bTime - aTime;
            });
        return matches[0] || null;
    },

    normalizeRun(meta, run) {
        const status = String(run?.status || '');
        const conclusion = String(run?.conclusion || '');
        const key = this.statusKey(status, conclusion, !!run);
        return {
            ...meta,
            id: run?.id || null,
            found: !!run,
            status,
            conclusion,
            statusKey: key,
            statusLabel: this.statusLabel(key),
            statusColor: this.statusColor(key),
            htmlUrl: run?.html_url || '',
            event: run?.event || '',
            branch: run?.head_branch || '',
            sha: run?.head_sha ? String(run.head_sha).slice(0, 7) : '',
            runNumber: run?.run_number || null,
            createdAt: run?.created_at || null,
            updatedAt: run?.updated_at || null,
            actor: run?.actor?.login || '',
            title: run?.display_title || '',
        };
    },

    statusKey(status, conclusion, found) {
        if (!found) return 'missing';
        if (status && status !== 'completed') return 'running';
        if (conclusion === 'success') return 'success';
        if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') return 'failure';
        if (conclusion === 'cancelled' || conclusion === 'action_required') return 'warning';
        return 'neutral';
    },

    statusLabel(key) {
        switch (key) {
            case 'success': return 'Успешно';
            case 'failure': return 'Ошибка';
            case 'warning': return 'Нужна проверка';
            case 'running': return 'Идёт';
            case 'missing': return 'Нет данных';
            default: return 'Неизвестно';
        }
    },

    statusColor(key) {
        switch (key) {
            case 'success': return '#166534';
            case 'failure': return '#b91c1c';
            case 'warning': return '#92400e';
            case 'running': return '#1d4ed8';
            case 'missing': return '#475569';
            default: return '#475569';
        }
    },

    esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    formatDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return new Intl.DateTimeFormat('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    },

    formatAge(value) {
        if (!value) return '—';
        const diffMs = Date.now() - new Date(value).getTime();
        if (!Number.isFinite(diffMs)) return '—';
        const minutes = Math.round(diffMs / 60000);
        if (minutes < 1) return 'только что';
        if (minutes < 60) return `${minutes} мин назад`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours} ч назад`;
        const days = Math.round(hours / 24);
        return `${days} дн назад`;
    },

    overallStatus() {
        const items = this.state.workflows || [];
        if (!items.length) {
            return {
                label: this.state.loading ? 'Обновляем…' : 'Нет данных',
                color: '#475569',
                note: 'Пока нет данных по workflow.'
            };
        }
        if (items.some(item => item.statusKey === 'failure' || item.statusKey === 'warning' || item.statusKey === 'missing')) {
            return {
                label: 'Нужна проверка',
                color: '#b91c1c',
                note: 'Есть workflow, которому нужно внимание.'
            };
        }
        if (items.some(item => item.statusKey === 'running')) {
            return {
                label: 'Идёт проверка',
                color: '#1d4ed8',
                note: 'Часть проверок сейчас выполняется.'
            };
        }
        return {
            label: 'Всё спокойно',
            color: '#166534',
            note: 'Последние deploy и smoke-проверки зелёные.'
        };
    },

    eventLabel(event) {
        switch (event) {
            case 'workflow_run': return 'после deploy';
            case 'workflow_dispatch': return 'вручную';
            case 'schedule': return 'по расписанию';
            case 'push': return 'push';
            default: return event || '—';
        }
    },

    renderSummaryCard() {
        const summary = this.overallStatus();
        const fetched = this.state.fetchedAt
            ? `${this.formatDateTime(this.state.fetchedAt)} · ${this.formatAge(this.state.fetchedAt)}`
            : '—';
        const badge = this.state.fromCache ? 'Снимок из кеша' : 'Свежие данные';
        return `
            <div class="stat-card" style="border-left:4px solid ${summary.color};">
                <div class="stat-label">Общий статус</div>
                <div class="stat-value" style="color:${summary.color};">${summary.label}</div>
                <div class="text-muted" style="font-size:12px;margin-top:6px;">${this.esc(summary.note)}</div>
                <div class="text-muted" style="font-size:11px;margin-top:8px;">Обновлено: ${this.esc(fetched)}</div>
                <div class="text-muted" style="font-size:11px;margin-top:4px;">Источник: ${this.esc(badge)}</div>
            </div>
        `;
    },

    renderWorkflowStat(item) {
        return `
            <div class="stat-card" style="border-left:4px solid ${item.statusColor};">
                <div class="stat-label">${this.esc(item.shortLabel)}</div>
                <div class="stat-value" style="color:${item.statusColor};">${this.esc(item.statusLabel)}</div>
                <div class="text-muted" style="font-size:12px;margin-top:6px;">${this.esc(this.formatAge(item.updatedAt || item.createdAt))}</div>
            </div>
        `;
    },

    renderWorkflowCard(item) {
        const metaBits = [
            item.runNumber ? `run #${item.runNumber}` : null,
            item.branch ? `ветка ${item.branch}` : null,
            item.sha ? `commit ${item.sha}` : null,
            this.eventLabel(item.event),
        ].filter(Boolean);
        const actionLink = item.htmlUrl
            ? `<a class="btn btn-sm btn-outline" href="${this.esc(item.htmlUrl)}" target="_blank" rel="noopener noreferrer">Открыть run</a>`
            : '';
        return `
            <div class="card" style="display:flex;flex-direction:column;gap:14px;">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
                    <div>
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                            <h3 style="margin:0;">${this.esc(item.shortLabel)}</h3>
                            <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:${item.statusColor}15;color:${item.statusColor};font-size:12px;font-weight:700;">
                                <span style="width:8px;height:8px;border-radius:999px;background:${item.statusColor};display:inline-block;"></span>
                                ${this.esc(item.statusLabel)}
                            </span>
                        </div>
                        <div class="text-muted" style="font-size:13px;margin-top:6px;">${this.esc(item.description)}</div>
                    </div>
                    ${actionLink}
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
                    <div style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-muted);">
                        <div class="text-muted" style="font-size:11px;">Последний старт</div>
                        <div style="font-size:13px;font-weight:600;margin-top:4px;">${this.esc(this.formatDateTime(item.createdAt))}</div>
                    </div>
                    <div style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-muted);">
                        <div class="text-muted" style="font-size:11px;">Последнее обновление</div>
                        <div style="font-size:13px;font-weight:600;margin-top:4px;">${this.esc(this.formatDateTime(item.updatedAt || item.createdAt))}</div>
                    </div>
                    <div style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-muted);">
                        <div class="text-muted" style="font-size:11px;">Контекст</div>
                        <div style="font-size:13px;font-weight:600;margin-top:4px;">${this.esc(metaBits.join(' · ') || '—')}</div>
                    </div>
                </div>
                <div class="text-muted" style="font-size:12px;">
                    ${this.esc(item.title || item.name)}
                </div>
            </div>
        `;
    },

    render() {
        const page = document.getElementById('page-monitoring');
        if (!page) return;

        const summaryCard = this.renderSummaryCard();
        const stats = (this.state.workflows || []).map(item => this.renderWorkflowStat(item)).join('');
        const cards = (this.state.workflows || []).map(item => this.renderWorkflowCard(item)).join('');
        const fetchedAt = this.state.fetchedAt ? this.formatDateTime(this.state.fetchedAt) : '—';
        const errorBanner = this.state.error
            ? `
                <div class="card" style="border:1px solid rgba(185,28,28,0.25);background:rgba(254,242,242,0.95);color:#991b1b;">
                    <strong>Есть проблема с обновлением статусов.</strong>
                    <div style="margin-top:6px;font-size:13px;">${this.esc(this.state.error)}</div>
                </div>
            `
            : '';
        const loadingLabel = this.state.loading ? 'Обновляем…' : 'Обновить';
        const rateLimitNote = this.state.rateLimitRemaining != null
            ? `GitHub API: осталось ${this.state.rateLimitRemaining} запросов${this.state.rateLimitResetAt ? `, сброс ${this.formatDateTime(this.state.rateLimitResetAt)}` : ''}.`
            : 'Панель показывает последние статусы deploy и smoke без похода в GitHub Actions.';

        page.innerHTML = `
            <div class="page-header">
                <div>
                    <h1>Панель спокойствия</h1>
                    <div class="text-muted" style="font-size:13px;">Deploy, live smoke и складской stress smoke в одном месте. Автообновление каждые 2 минуты на открытой странице.</div>
                </div>
                <div class="flex gap-8">
                    <a class="btn btn-outline" href="${this.esc(this.actionsUrl)}" target="_blank" rel="noopener noreferrer">GitHub Actions</a>
                    <button class="btn btn-primary" onclick="Monitoring.forceRefresh()" ${this.state.loading ? 'disabled' : ''}>${this.esc(loadingLabel)}</button>
                </div>
            </div>

            ${errorBanner}

            <div class="stats-grid monitoring-summary">
                ${summaryCard}
                ${stats}
            </div>

            <div class="card" style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start;">
                <div>
                    <h3 style="margin-bottom:6px;">Как это страхуется</h3>
                    <div class="text-muted" style="font-size:13px;line-height:1.5;">
                        После каждого deploy и каждые 4 часа сайт автоматически гоняет smoke-проверки.
                        Если что-то падает, прилетает Telegram-alert и открывается GitHub issue, который потом сам закроется после восстановления.
                    </div>
                </div>
                <div class="text-muted" style="font-size:12px;min-width:240px;">
                    <div><strong>Версия сайта:</strong> ${this.esc(typeof APP_VERSION !== 'undefined' ? APP_VERSION : '—')}</div>
                    <div style="margin-top:4px;"><strong>Последнее обновление панели:</strong> ${this.esc(fetchedAt)}</div>
                    <div style="margin-top:4px;">${this.esc(rateLimitNote)}</div>
                </div>
            </div>

            <div style="display:grid;gap:16px;" id="monitoring-workflows">
                ${cards || `
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-icon">&#128200;</div>
                            <p>${this.state.loading ? 'Собираем статусы workflow…' : 'Пока нет данных по workflow.'}</p>
                        </div>
                    </div>
                `}
            </div>
        `;
    },
};
