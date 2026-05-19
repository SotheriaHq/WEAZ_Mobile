## Performance: navigate-first discipline

No route push may await a network request, image picker, permission prompt,
large data transformation, upload, or any other Promise.

Navigation is synchronous. Destination screens render a skeleton, pending state,
or empty state first, then hydrate data inside their own lifecycle.

Forbidden pattern:

```ts
const result = await someAsyncWork();
router.push({ pathname: '/dest', params: result });
```

Required pattern:

```ts
router.push({ pathname: '/dest', params: { openPicker: '1' } });
// Destination screen runs async work after mount.
```

Any PR that introduces an awaited Promise immediately before `router.push`,
`router.replace`, or `navigation.navigate` must be rejected unless there is a
documented safety exception.

## Performance budgets

Reference devices:

* Tecno Pop 7 or equivalent low-end Android
* iPad 5th gen or equivalent low-end iOS tablet

| Metric                                     | Target        |
| ------------------------------------------ | ------------- |
| Cold app start to first interactive screen | <= 3.0s       |
| Existing route navigation                  | <= 250ms total |
| Feed time-to-first-content on 4G           | <= 1.5s       |
| API p95 round-trip from Lagos              | <= 600ms      |
| Resident memory on iPad 5th gen            | <= 250MB      |
| Scroll FPS on low-end Android              | >= 55 FPS     |
