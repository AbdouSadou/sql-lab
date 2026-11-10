// SQL query status component
// shows the state of the SQL query execution
class SqlimeStatus extends HTMLElement {
    connectedCallback() {
        if (!this.rendered) {
            this.render();
            this.rendered = true;
        }
    }

    render() {
        const el = document.createElement("div");
        this.appendChild(el);
        this.el = el;
    }

    // loading shows the message with a spinner
    loading(message) {
        this.el.className = "";
        this.value = `<span class="sqlime-spinner"></span> ${message}...`;
    }

    // success shows the message and marks is as success
    success(message) {
        this.el.className = "sql-status--success";
        this.value = message;
    }

    // info shows the message without styling it
    info(message) {
        this.el.className = "";
        this.value = message;
    }

    // error shows the message and marks is as error
    error(message) {
        this.el.className = "sql-status--error";
        this.value = message;
    }

    // fadeOut marks the message as stale: secondary text colour, which keeps 4.5:1 (an opacity of
    // 0.4 left the text at 2.4:1).
    fadeOut() {
        this.classList.add("sqlime-status--stale");
    }

    // fadeIn brings the message back to the text colour.
    fadeIn() {
        setTimeout(() => {
            this.classList.remove("sqlime-status--stale");
        }, 100);
    }

    get value() {
        return this.el.innerText;
    }
    // The message is HTML (the welcome text holds buttons). Callers must escape every
    // string that comes from SQL, a database, a file name, a URL or an error
    // with escapeHtml() from js/lab/html.js.
    set value(newValue) {
        this.el.innerHTML = newValue;
    }
}

customElements.define("sqlime-status", SqlimeStatus);
