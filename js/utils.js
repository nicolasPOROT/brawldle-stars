const Utils = {

    getTimeUntilMidnight() {
        const now = new Date();
        const midnight = new Date(now);

        midnight.setHours(24, 0, 0, 0);

        const diff = midnight - now;

        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);

        return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
    },

    updateResetLabels() {
        document.querySelectorAll(".text-reset").forEach(label => {
            label.textContent = this.getTimeUntilMidnight();
        });
    }

};