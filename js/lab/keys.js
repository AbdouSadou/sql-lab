// The modifier key the page names: Ctrl, or ⌘ on an Apple device. Every element with the
// data-mod attribute (the shortcut hints of Run and Check answer, the Help popover) holds "Ctrl"
// in the markup; showPlatformKeys() puts "⌘" there on a Mac, an iPad or an iPhone.

// userAgentData.platform says "macOS" (Chromium), navigator.platform "MacIntel", "iPhone" or "iPad"
export const IS_APPLE = /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform || navigator.platform || "");

export const MOD_KEY = IS_APPLE ? "⌘" : "Ctrl";

export function showPlatformKeys(root = document) {
    if (!IS_APPLE) {
        return;
    }
    for (const element of root.querySelectorAll("[data-mod]")) {
        element.textContent = MOD_KEY;
    }
}
