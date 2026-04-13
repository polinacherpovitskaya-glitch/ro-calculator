// =============================================
// Recycle Object — Legacy Analytics Redirect
// =============================================

const Analytics = {
    async load() {
        if (typeof App !== 'undefined' && typeof App.navigate === 'function') {
            App.navigate('factual');
            return;
        }
        if (typeof Factual !== 'undefined' && typeof Factual.load === 'function') {
            await Factual.load();
        }
    },
};
