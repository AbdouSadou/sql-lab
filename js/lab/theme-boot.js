// Before the first paint (a classic script in the <head> of every page, after the theme-color
// metas and before any stylesheet): apply the theme the student chose. data-theme="light" or "dark"
// on <html> pins the palette (css/tokens.css); no attribute means "match the device". The
// theme-color metas (the browser's own chrome, a phone's address bar) carry one colour per scheme
// in data-scheme; a pinned theme makes its own meta apply everywhere and the other nowhere, so no
// colour is written here. js/lab/theme.js does the same when the choice changes.
//
// The key is THEME_STORAGE_KEY of js/lab/config.js, written again here because a module runs too
// late to avoid a flash of the other theme; tests/ui1-tokens.spec.js checks that the two agree.
(function () {
    var choice = null;
    try {
        choice = window.localStorage.getItem("sqllab.theme");
    } catch (error) {
        // storage blocked or unusable: follow the device
    }
    if (choice !== "light" && choice !== "dark") {
        return;
    }
    document.documentElement.setAttribute("data-theme", choice);
    var metas = document.querySelectorAll('meta[name="theme-color"][data-scheme]');
    for (var i = 0; i < metas.length; i++) {
        metas[i].setAttribute("media", metas[i].getAttribute("data-scheme") === choice ? "all" : "not all");
    }
})();
