// Command bar element
class CommandBar extends HTMLElement {
    connectedCallback() {
        if (!this.rendered) {
            this.render();
            this.rendered = true;
        }
    }

    render() {
        this.innerHTML = `
<button id="execute" data-action="executeCurrent" title="⌃↵ or ⌘↵">
    run
    <svg viewBox="0 0 800 800" aria-hidden="true" focusable="false">
        <path fill="currentColor" fill-rule="evenodd" stroke="none" d="M 50 0 L 50 800 L 750 400 Z" />
    </svg>
</button>
<button id="show-tables" data-action="showTables" title="⌃/ or ⌘/">
    <svg viewBox="0 0 800 800" aria-hidden="true" focusable="false">
        <path fill="currentColor" fill-rule="evenodd" stroke="none"
            d="M 519.999756 704.761902 L 719.999756 704.761902 L 719.999756 514.285706 L 519.999756 514.285706 L 519.999756 704.761902 Z M 439.999542 780.952393 L 800 780.952393 L 800 438.095245 L 439.999542 438.095245 L 439.999542 780.952393 Z M 519.999756 285.714294 L 719.999756 285.714294 L 719.999756 95.238098 L 519.999756 95.238098 L 519.999756 285.714294 Z M 439.999542 361.904755 L 800 361.904755 L 800 19.047607 L 439.999542 19.047607 L 439.999542 361.904755 Z M 80.000229 704.761902 L 280.000244 704.761902 L 280.000244 95.238098 L 80.000229 95.238098 L 80.000229 704.761902 Z M 0 780.952393 L 360.000458 780.952393 L 360.000458 19.047607 L 0 19.047607 L 0 780.952393 Z" />
    </svg>
    tables
</button>
<button id="copy-link" data-action="copyLink" title="Copy a link that opens this query">copy link</button>`;
    }
}

customElements.define("command-bar", CommandBar);
