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

## Strategies

| Strategy | Rendering behavior |
| --- | --- |
| edge | Foreground image fills the container with `cover`. |
| contain-blur | Blurred cover backdrop plus contained foreground. |
| letter-blur | Same visual treatment as `contain-blur`, tracked separately for diagnostics. |
| letter-soft | Softer blurred backdrop and lighter wash plus contained foreground. |
| letter-solid | Solid dark background plus contained foreground. |

Unknown image dimensions default to `contain-blur` when the container is known, and `edge` when no dimensions are available yet. Once the image reports intrinsic dimensions, the strategy is resolved again without changing the container size.

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
