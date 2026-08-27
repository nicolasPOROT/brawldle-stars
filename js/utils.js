const Utils = {

    STORAGE_KEY: "brawldle-completed-modes",
    SUPABASE_URL: "https://szvogkodnqqkkkzbiihd.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6dm9na29kbnFxa2tremJpaWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDc0NDksImV4cCI6MjA5NjU4MzQ0OX0.HENgyyB136cw5_Dms44g7gTGAxdvpOVg1Fe5dJBQCLo",

    getToday() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    },

    getCompletedModes() {
        const saved = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || "null");
        return saved && saved.date === this.getToday() ? new Set(saved.modes) : new Set();
    },

    markModeCompleted(modeId) {
        const modes = this.getCompletedModes();
        modes.add(String(modeId));
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
            date: this.getToday(),
            modes: [...modes]
        }));
        this.updateProgressBars();
    },

    updateProgressBars() {
        const completedCount = this.getCompletedModes().size;
        const assetPrefix = location.pathname.includes("/pages/") ? "../" : "";
        document.querySelectorAll(".play-progress").forEach(progress => {
            [...progress.querySelectorAll("img")].forEach((segment, index) => {
                const isComplete = index < completedCount;
                segment.src = `${assetPrefix}assets/design/progress-bar-segment-${isComplete ? "true" : "false"}.png`;
            });
        });
    },

    async getTodaysModes() {
        const today = new Date().toISOString().slice(0, 10);
        const url = new URL(`${this.SUPABASE_URL}/rest/v1/daily_schedule`);
        url.searchParams.set("select", "mode_id,mode_slot,game_mode(id,name,is_enabled)");
        url.searchParams.set("play_date", `eq.${today}`);
        url.searchParams.set("order", "mode_slot.asc");

        const response = await fetch(url, {
            headers: {
                apikey: this.SUPABASE_ANON_KEY,
                Authorization: `Bearer ${this.SUPABASE_ANON_KEY}`
            }
        });
        if (!response.ok) throw new Error("Unable to load today's modes");
        return response.json();
    },

    setupPlayLinks() {
        document.querySelectorAll(".play-cta").forEach(link => {
            link.addEventListener("click", async event => {
                event.preventDefault();
                try {
                    const completed = this.getCompletedModes();
                    const modes = (await this.getTodaysModes()).filter(row => row.game_mode?.is_enabled);
                    const next = modes.find(row => !completed.has(String(row.mode_id))) || modes[0];
                    if (next?.game_mode?.name) {
                        const prefix = location.pathname.includes("/pages/") ? "" : "pages/";
                        location.href = `${prefix}${this.normalizeModeName(next.game_mode.name)}.html`;
                        return;
                    }
                } catch (error) {
                    console.error(error);
                }
                location.href = link.getAttribute("href");
            });
        });
    },

    normalizeModeName(name) {
        return String(name || "").trim().toLowerCase().replace(/\s+/g, "_");
    },

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

Utils.updateResetLabels();
Utils.updateProgressBars();
Utils.setupPlayLinks();