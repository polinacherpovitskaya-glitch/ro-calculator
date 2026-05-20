function pickActiveLinkedEmployee(rows) {
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    return list.find(row => row && row.is_active) || null;
}

function pickAnyLinkedEmployee(rows) {
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    return list[0] || null;
}

function buildInactiveBindingMessage(employee) {
    const name = employee?.name ? `«${employee.name}»` : 'неактивному профилю';
    return (
        `Этот Telegram сейчас привязан к неактивному профилю ${name}.\n\n` +
        'Часы с него больше не принимаются, чтобы они не записывались под чужим именем.\n' +
        'Используй свой рабочий Telegram-аккаунт или попроси перепривязать профиль через Настройки → Сотрудники.'
    );
}

module.exports = {
    pickActiveLinkedEmployee,
    pickAnyLinkedEmployee,
    buildInactiveBindingMessage,
};
