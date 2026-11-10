// Icons: Lucide (lucide-static, ISC licence: vendor/lucide.LICENSE.txt), drawn from the sprite that
// tools/build-icons.mjs writes into index.html. The sprite holds only the icons the code names: the
// script collects every icon("name") call and every "#icon-name" reference in js/ and the HTML.
//
// Write the name literally, icon("sun"), never from a variable: that is how the builder finds it.
// To switch an icon, make both and hide one.
//
// icon(name, {filled}) -> a decorative <svg> (aria-hidden; the control next to it carries the words).
// Sizes, stroke and colour come from the .icon rules in css/core.css (16 px, a 1.5 px stroke at that
// size, currentColor); {filled: true} fills the shape instead (for a solid shape such as the
// Run triangle of the redesign).

const SVG_NS = "http://www.w3.org/2000/svg";

export function icon(name, { filled = false } = {}) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", filled ? "icon icon--filled" : "icon");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `#icon-${name}`);
    svg.append(use);
    return svg;
}
