// Snortle theme loader. Put this file in /views/
function getSnortleTheme() {
    var theme = 'dark';
    try {
        theme = localStorage.getItem('snortle-theme') || 'dark';
    } catch (e) {}
    return theme;
}

function setSnortleTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
        localStorage.setItem('snortle-theme', theme);
    } catch (e) {}
}

// Apply the saved theme right away so the page doesn't flash dark first
document.documentElement.setAttribute('data-theme', getSnortleTheme());

// Phones: start with the sidebar closed, and close it after picking something
document.addEventListener('DOMContentLoaded', function () {
    if (window.innerWidth > 700) return;
    var sidebar = document.getElementById('sidebar');
    var shell = document.getElementById('chatShell');
    var toggle = document.getElementById('sidebarToggle');
    if (!sidebar || !toggle) return;

    sidebar.classList.add('collapsed');
    if (shell) shell.classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
    toggle.textContent = '›';
    toggle.classList.remove('is-open');

    sidebar.addEventListener('click', function (e) {
        var hit = e.target.closest('.chat-item, .new-chat-btn');
        if (hit && !sidebar.classList.contains('collapsed')) {
            toggle.click();
        }
    });
});