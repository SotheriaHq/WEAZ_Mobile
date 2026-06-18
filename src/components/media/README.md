# AspectAwareMedia

`AspectAwareMedia` centralizes media rendering for large fashion images that can be portrait, square, landscape, or ultra-wide. It prevents harsh tablet gutters and accidental over-cropping while keeping the foreground image undistorted.

## Container Buckets

The resolver classifies the visible container by width divided by height:

| Bucket | Aspect range |
| --- | --- |
| ultra-tall | below 0.45 |
| tall | 0.45 to below 0.55 |
| standard-tall | 0.55 to below 0.65 |
| near-square-portrait | 0.65 to below 0.85 |
| square-ish | 0.85 to below 1.15 |
| near-square-landscape | 1.15 to below 1.5 |
| wide | 1.5 to below 1.9 |
| ultra-wide | 1.9 and above |

## Image Classes

The image itself is classified by width divided by height:

| Class | Aspect range |
| --- | --- |
| ultra-portrait | below 0.55 |
| portrait | 0.55 to below 0.85 |
| square | 0.85 to below 1.15 |
| landscape | 1.15 to below 1.85 |
| ultra-wide | 1.85 and above |
| unknown | missing, invalid, non-finite, or less than or equal to zero |

## Strategies (Phase 10)

The resolver no longer uses a 40-cell bucket matrix. It computes the `cover` crop
fraction for the actual image/container aspects; if `cover` would crop no more than
`0.28` of the image it fills edge-to-edge, otherwise it `contain`s the image (no
detail cropping) and picks a backdrop by image shape.

| Strategy | Rendering behavior | Used for |
| --- | --- | --- |
| edge | Foreground fills with `cover` (negligible crop). | Snug-fitting media (portrait in a portrait container). |
| letter-solid | Contained foreground on a clean dominant-color matte, no backdrop. | Non-fitting portrait media; unknown dimensions. |
| letter-soft | Contained foreground + **subtle** same-image ambient (blur 10, opacity 0.32, light wash). | **Square** media. |
| letter-blur | Contained foreground + **stronger** same-image ambient (blur 16, opacity 0.55). | **Landscape / ultra-wide** media. |
| contain-blur | Legacy alias rendered like `letter-blur`; not emitted by the resolver. | Back-compat / explicit overrides. |

Square (`letter-soft`) and landscape (`letter-blur`) deliberately use different blur
and opacity values so the two never read as the same treatment. Neither uses a dark
wash. The foreground is always sharp and uncropped via `contentFit="contain"`.

Unknown image dimensions resolve to `letter-solid` (clean matte — never a blurred
flash, never cropping). Once the image reports intrinsic dimensions the strategy is
resolved again inside the same fixed container, so the only change is a foreground
rescale — no container-size layout shift.

Small fixed-aspect grid cards (catalog / product / collection cards) do **not** use an
ambient backdrop. They use a clean clipped `cover` media container with no top/bottom
strip and no background leak.

## When To Use

Use `AspectAwareMedia` for large product, design, runway, collection, and future catalog-card media where preserving the image shape matters more than fixed cover cropping.

`FeedImage` now uses `AspectAwareMedia` for its final media layer while keeping its existing protected-file resolution, stale-image display, retry, loading, and fallback behavior.

`StableImage` supports an opt-in `aspectAware` mode for future call sites that need this behavior without replacing the default crossfade path used by existing UI.

## When Not To Use

Do not use `AspectAwareMedia` for:

- avatars
- icons
- fixed square thumbnails
- tiny UI chrome

Those surfaces intentionally use fixed-size cover rendering so brand/profile identity, hit targets, and compact UI stay predictable.

## Phase 4 Note

Profile catalog cards and masonry/full-display catalog layouts should use this renderer where large media needs aspect-aware treatment. The masonry/grid redesign itself is not part of Phase 3.
