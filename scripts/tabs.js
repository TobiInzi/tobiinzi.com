// Section switching via an ARIA tab interface: the tabs swap the visible panel in
// the main area and reset its scroll position. Arrow / Home / End keys move
// between tabs with automatic activation and a roving tabindex. `onChange(id)` is
// invoked after each switch so the page can react (e.g. run the Home field loop).
export function initTabs(onChange) {
  const tablist = document.querySelector(".sections");
  const tabs = [...tablist.querySelectorAll(".section-link")];
  const panels = [...document.querySelectorAll(".panel")];
  const content = document.querySelector(".content");

  function showSection(id) {
    for (const tab of tabs) {
      const selected = tab.dataset.section === id;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of panels) {
      const active = panel.dataset.section === id;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    }
    content.scrollTop = 0;
    if (onChange) onChange(id);
  }

  tablist.addEventListener("click", (event) => {
    const tab = event.target.closest(".section-link");
    if (!tab) return;
    showSection(tab.dataset.section);
  });

  tablist.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(document.activeElement);
    if (index === -1) return;

    let nextIndex;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    showSection(nextTab.dataset.section);
    nextTab.focus();
  });
}
