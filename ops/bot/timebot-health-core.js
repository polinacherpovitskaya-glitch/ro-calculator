const DEFAULT_HEALTH_MAX_AGE_MS = 3 * 60 * 1000;

function normalizeHealthErrorCode(error) {
    const raw = error?.response?.statusCode
        || error?.statusCode
        || error?.code
        || error?.name
        || 'unknown';
    return String(raw)
        .replace(/[^a-zA-Z0-9_.:-]/g, '_')
        .slice(0, 80);
}

function validateTimebotHealthSnapshot(snapshot, options = {}) {
    const nowMs = Number(options.nowMs) || Date.now();
    const maxAgeMs = Number(options.maxAgeMs) > 0
        ? Number(options.maxAgeMs)
        : DEFAULT_HEALTH_MAX_AGE_MS;
    const issues = [];

    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        return {
            ok: false,
            age_ms: null,
            issues: ['health_snapshot_missing_or_invalid'],
        };
    }

    const checkedAtMs = Date.parse(String(snapshot.checked_at || ''));
    const ageMs = Number.isFinite(checkedAtMs) ? Math.max(0, nowMs - checkedAtMs) : null;
    if (ageMs === null) {
        issues.push('checked_at_missing_or_invalid');
    } else if (ageMs > maxAgeMs) {
        issues.push(`heartbeat_stale_${ageMs}ms`);
    }

    if (snapshot.ok !== true) issues.push('self_check_unhealthy');
    if (snapshot.polling !== true) issues.push('telegram_polling_inactive');
    if (snapshot.telegram_ok !== true) issues.push('telegram_probe_failed');
    if (snapshot.database_ok !== true) issues.push('database_probe_failed');

    return {
        ok: issues.length === 0,
        age_ms: ageMs,
        issues,
    };
}

module.exports = {
    DEFAULT_HEALTH_MAX_AGE_MS,
    normalizeHealthErrorCode,
    validateTimebotHealthSnapshot,
};
