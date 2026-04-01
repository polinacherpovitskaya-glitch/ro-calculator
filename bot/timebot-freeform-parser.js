const DEFAULT_STAGE_LABELS = {
    casting: 'Выливание пластика',
    trim: 'Срезание литника',
    assembly: 'Сборка',
    packaging: 'Упаковка',
    other: 'Другое',
};

const HOURS_SUFFIX_RE = /\s*[—–-]\s*([\d]+(?:[.,]\d+)?)\s*(?:ч|ч\.|час(?:а|ов)?)\s*$/i;
const DATE_PREFIX_RE = /^\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s*[—–-]\s*/;

function normalizeText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ');
}

function toFourDigitYear(value, nowYear) {
    if (!value) return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (num >= 1000) return num;
    const century = Math.floor(nowYear / 100) * 100;
    return century + num;
}

function inferYear(day, month, explicitYear, now = new Date()) {
    if (explicitYear) return explicitYear;
    const currentYear = now.getFullYear();
    const todayUtc = Date.UTC(currentYear, now.getMonth(), now.getDate());
    const candidateUtc = Date.UTC(currentYear, month - 1, day);
    const diffDays = Math.round((candidateUtc - todayUtc) / 86400000);
    if (diffDays > 31) return currentYear - 1;
    return currentYear;
}

function formatYmd(year, month, day) {
    return [
        String(year).padStart(4, '0'),
        String(month).padStart(2, '0'),
        String(day).padStart(2, '0'),
    ].join('-');
}

function buildStageAliasMap(stageLabels = DEFAULT_STAGE_LABELS) {
    const base = {
        casting: stageLabels.casting || DEFAULT_STAGE_LABELS.casting,
        trim: stageLabels.trim || DEFAULT_STAGE_LABELS.trim,
        assembly: stageLabels.assembly || DEFAULT_STAGE_LABELS.assembly,
        packaging: stageLabels.packaging || DEFAULT_STAGE_LABELS.packaging,
        other: stageLabels.other || DEFAULT_STAGE_LABELS.other,
    };

    const map = new Map();
    Object.entries(base).forEach(([key, label]) => {
        map.set(normalizeText(label), { key, label });
    });

    [
        ['литье', 'casting'],
        ['литьё', 'casting'],
        ['выливание', 'casting'],
        ['выливание пластика', 'casting'],
        ['срезание литника', 'trim'],
        ['литник', 'trim'],
        ['сборка', 'assembly'],
        ['упаковка', 'packaging'],
        ['другое', 'other'],
    ].forEach(([alias, key]) => {
        map.set(normalizeText(alias), { key, label: base[key] });
    });

    return map;
}

function parseLine(line, options = {}) {
    const raw = String(line || '');
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const dateMatch = trimmed.match(DATE_PREFIX_RE);
    if (!dateMatch) {
        return { error: 'missing_date', raw: raw };
    }

    const hoursMatch = trimmed.match(HOURS_SUFFIX_RE);
    if (!hoursMatch) {
        return { error: 'missing_hours', raw: raw };
    }

    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const explicitYear = toFourDigitYear(dateMatch[3], (options.now || new Date()).getFullYear());
    if (!Number.isFinite(day) || !Number.isFinite(month) || day < 1 || day > 31 || month < 1 || month > 12) {
        return { error: 'invalid_date', raw: raw };
    }

    const hours = Number(String(hoursMatch[1]).replace(',', '.'));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        return { error: 'invalid_hours', raw: raw };
    }

    const withoutDate = trimmed.slice(dateMatch[0].length);
    const middle = withoutDate.slice(0, withoutDate.length - hoursMatch[0].length).trim();
    const stageSeparatorIndex = middle.lastIndexOf('/');
    if (stageSeparatorIndex === -1) {
        return { error: 'missing_stage_separator', raw: raw };
    }

    const projectName = middle.slice(0, stageSeparatorIndex).trim();
    const stageRaw = middle.slice(stageSeparatorIndex + 1).trim();
    if (!projectName || !stageRaw) {
        return { error: 'missing_project_or_stage', raw: raw };
    }

    const stageAliases = buildStageAliasMap(options.stageLabels);
    const stageMatch = stageAliases.get(normalizeText(stageRaw));
    const year = inferYear(day, month, explicitYear, options.now || new Date());

    return {
        raw: raw,
        date: formatYmd(year, month, day),
        project_name: projectName,
        stage: stageMatch ? stageMatch.key : 'other',
        stage_label: stageMatch ? stageMatch.label : stageRaw,
        hours: Math.round(hours * 100) / 100,
    };
}

function parseFreeformBatchReport(text, options = {}) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const entries = [];
    const errors = [];

    lines.forEach((line, index) => {
        const parsed = parseLine(line, options);
        if (!parsed) return;
        if (parsed.error) {
            errors.push({ index, line, error: parsed.error });
            return;
        }
        entries.push(parsed);
    });

    return { entries, errors };
}

function looksLikeFreeformBatchReport(text) {
    const raw = String(text || '');
    return /\d{1,2}\.\d{1,2}(?:\.\d{2,4})?\s*[—–-].+\/.+[—–-]\s*[\d.,]+\s*(?:ч|ч\.|час)/i.test(raw);
}

module.exports = {
    DEFAULT_STAGE_LABELS,
    normalizeText,
    parseLine,
    parseFreeformBatchReport,
    looksLikeFreeformBatchReport,
};
