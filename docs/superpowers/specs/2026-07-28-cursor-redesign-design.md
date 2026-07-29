# AI cursor redesign

## Goal

Replace the warped cursor with a clean, elongated pointer whose source geometry
stands perfectly upright. The browser overlay, not the SVG asset, applies the
familiar cursor angle.

## Geometry

The master shape uses these design-space measurements:

- height: 41 units;
- base width: 33 units;
- centered inverted-V notch depth: 9 units;
- vertical centerline: `x = 20.5`;
- tip hotspot: `(20.5, 1.5)`;
- base corners: `(4, 42.5)` and `(37, 42.5)`;
- notch apex: `(20.5, 33.5)`.

The resulting closed path is:

```text
M20.5 1.5 L37 42.5 L20.5 33.5 L4 42.5 Z
```

The outside triangle is bilaterally symmetric. Its half-base is 16.5 units,
giving an apex half-angle of approximately `atan(16.5 / 41) = 21.9°`. The full
tip angle is therefore approximately 43.8°. The notch is also centered and
symmetric.

### Future base-width adjustment

`CURSOR_BASE_WIDTH = 33` is the parameter to change when making the cursor
narrower or wider. Keep the centerline fixed at `CURSOR_CENTER_X = 20.5` and
derive the two base corners rather than moving them independently:

```text
leftBaseX  = CURSOR_CENTER_X - CURSOR_BASE_WIDTH / 2
rightBaseX = CURSOR_CENTER_X + CURSOR_BASE_WIDTH / 2
```

For the current width:

```text
leftBaseX  = 20.5 - 33 / 2 = 4
rightBaseX = 20.5 + 33 / 2 = 37
```

Changing the width must update:

1. the exported geometry constant used by the overlay;
2. the derived left and right base coordinates in the overlay path;
3. the matching path in `public/browser-cursor.svg`;
4. geometry-test expectations and the documented tip-angle calculation.

Do not change the centerline, tip coordinate, base Y coordinate, or display
rotation merely to tune width. Review the notch depth separately; it is
currently `CURSOR_NOTCH_DEPTH = 9`.

## Appearance

- Fill: existing browser-control blue, `#2f7cf6`.
- Outline: white, 1.75 design units, round joins.
- Shadow: `drop-shadow(0 2px 2px rgb(0 0 0 / 48%))` plus
  `drop-shadow(0 6px 6px rgb(0 0 0 / 28%))`, applied to the rendered glyph.
  The first layer defines the cursor edge; the second provides a visible soft
  shadow below it.
- Source asset: upright, with no `transform` or baked-in angle.
- Canvas: `viewBox="0 0 41 45"` with
  `preserveAspectRatio="xMidYMid meet"`.
- Display size: 30 CSS pixels high with width derived from the viewBox,
  `30 × 41 / 45 = 27.333…` CSS pixels. Width and height must not be assigned
  independently in a way that permits non-uniform scaling.

The shape is intentionally closer to a precise desktop pointer than a broad map
marker. The 33-unit base sits between the reviewed 30- and 36-unit options.

## Idle motion

While visible, the rendered glyph continuously rocks between `-31deg` and
`-25deg` around its normal `-28deg` display angle:

```text
animation: cursor-wobble 1.6s ease-in-out infinite alternate
```

The animation rotates only the glyph layer. Its transform origin is on the
cursor centerline, 30% of the 41-unit cursor body height below the tip:
`(20.5, 13.8)` in the upright SVG. The position wrapper remains fixed at the
requested click coordinate. The click target remains the SVG tip before the
idle transform, while the visible tip moves slightly around the lower pivot.
This gives the cursor a body-led sway instead of pinning the motion at its tip.

When `prefers-reduced-motion: reduce` is active, disable the wobble and render
the glyph at the static `-28deg` display angle. The click pulse uses a separate
layer so it does not replace the persistent shadow or rotation animation.

## Overlay transform and hotspot

The overlay positions an unrotated wrapper at the target point. Inside it, the
glyph is offset so its SVG tip coincides with wrapper origin `(0, 0)` before
rotation. The glyph then rotates around the 30%-down body pivot.

This separation preserves the targeting invariant:

```text
unrotated SVG tip = requested overlay coordinate
```

Changing the display angle must never change the resolved browser target or the
cursor-arrival acknowledgement.

## Implementation boundaries

1. Replace `public/browser-cursor.svg` with the upright 33-unit geometry.
2. Replace the CSS border triangle in `CursorView` with the same inline SVG
   geometry.
3. Apply rotation, shadow, and wobble only in overlay CSS and use the
   30%-down centerline point as `transform-origin`.
4. Keep the click pulse on a separate layer from the animated glyph.
5. Preserve existing cursor movement, pulse, accessibility, pointer-events,
   stale-host replacement, and arrival behavior.

## Verification

- Add a geometry test proving bilateral symmetry, 33-unit base width, 9-unit
  notch depth, and absence of a transform in the master asset.
- Add an overlay test proving the displayed glyph uses the same path, the
  30%-down transform origin, the `-31deg` to `-25deg` ease-in-out wobble, the
  layered downward shadow, and the reduced-motion `-28deg` fallback.
- Test the pivot numerically: it must remain fixed through the wobble rotation
  range, while the tip must move around it.
- Render the upright SVG at multiple sizes and inspect it visually.
- Reload the real extension, exercise cursor movement between two targets, and
  inspect screenshots to confirm the glyph looks clean, the lower-body pivot
  stays visually stable, and the tip moves slightly through the wobble.
- Confirm the Chrome extension Errors page remains empty.
