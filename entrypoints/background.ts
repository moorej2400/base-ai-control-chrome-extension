import { defineBackground } from '#imports';

export default defineBackground(() => {
  // Open the side panel when the toolbar icon is clicked.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('Failed to set side panel behavior:', err));

  // Keyboard shortcut (default Ctrl/Cmd+J) opens the panel. onCommand is a user
  // gesture, so sidePanel.open is allowed here.
  chrome.commands?.onCommand.addListener((command, tab) => {
    if (command !== 'open-panel') return;
    const target =
      tab?.windowId != null ? { windowId: tab.windowId } : undefined;
    (target ? chrome.sidePanel.open(target) : Promise.resolve()).catch((err) =>
      console.error('Failed to open side panel from shortcut:', err),
    );
  });
});
