# 🎲 Random Symbol Pattern

A lightweight feature that picks a random image from the `Symbol/` folder each time the page loads, and uses it as the repeating background pattern inside the SVG gift card component.

---

## How it works

On every page load, a small script runs before `app.js` and does three things:

1. Picks a random image path from a predefined array
2. Targets the `<image id="giftPattern">` element inside the SVG
3. Updates its `xlink:href` attribute using `setAttributeNS` to apply the chosen image

```js
const symbols = [
    "Symbol/baphomet.png",
    "Symbol/Moon-Eagle.png",
    "Symbol/Pegasus.png"
];

const randomImage = symbols[Math.floor(Math.random() * symbols.length)];

document.getElementById("giftPattern").setAttributeNS(
    "http://www.w3.org/1999/xlink",
    "xlink:href",
    randomImage
);
```

---

## Adding a new image

**Step 1** — Drop your image into the `Symbol/` folder:

```
Symbol/YourImage.png
```

**Step 2** — Add it to the `symbols` array in `index.html`:

```js
const symbols = [
    "Symbol/baphomet.png",
    "Symbol/Moon-Eagle.png",
    "Symbol/Pegasus.png",
    "Symbol/YourImage.png"   // <-- add here
];
```

That's it. No other changes needed.

---

## Why `setAttributeNS` instead of `setAttribute`?

The `<image>` tag lives inside an SVG and uses the **XLink namespace** (`http://www.w3.org/1999/xlink`). Regular `setAttribute` ignores the namespace and fails silently in some browsers. `setAttributeNS` targets the attribute correctly across all browsers.

---

## Supported formats

Any image format that browsers support natively works here:

| Format | Supported |
|--------|-----------|
| `.png` | ✅ |
| `.jpg` / `.jpeg` | ✅ |

---

## Notes

- The image is picked once per page load — refreshing the page may show a different symbol
- All images in the `Symbol/` folder should ideally be the same dimensions for consistent tiling
- The pattern is rendered at `100x100` units inside the SVG, then tiled and filtered automatically by the existing `patternColorFilter`
