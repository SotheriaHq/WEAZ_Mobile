/**
 * The tab navigator, registered by the hidden tab bar in `app/(tabs)/_layout.tsx`.
 *
 * Island presses need to pop a tab's own nested stack. `JUMP_TO` only changes
 * which tab is focused, and the catalogue stack keeps `/catalog/[brandId]`
 * after you leave it — so the next Me press from Runway showed that visitor
 * screen again. The navigation object that can target that nested stack lives
 * on the tab bar, which the feed and the island do not render.
 */
type NestedStackState = {
  key?: string;
  index?: number;
  routes?: ReadonlyArray<{ name?: string }>;
};

type IslandTabNavigation = {
  getState: () => {
    routes: ReadonlyArray<{
      name: string;
      state?: NestedStackState;
    }>;
  };
  dispatch: (action: {
    type: string;
    target?: string;
    payload?: { name: string; merge?: boolean };
  }) => void;
};

let navigation: IslandTabNavigation | null = null;

export function registerIslandTabNavigation(next: IslandTabNavigation | null) {
  navigation = next;
}

/**
 * Put `tabName`'s nested stack back on its `index` screen.
 *
 * `POP_TO_TOP` is a no-op when the visitor screen is the whole stack
 * (`index === 0`). That is the state left behind when Back from
 * `/catalog/[brandId]` cannot pop and falls through to Runway: the next Me
 * press re-focuses that visitor screen. `POP_TO` `index` pops to it when it
 * is underneath, and replaces the visitor route when it is the only one.
 */
export function popIslandTabStackToRoot(tabName: string): boolean {
  const current = navigation;
  const state = current?.getState();
  if (!current || !state) return false;
  const route = state.routes.find((entry) => entry.name === tabName);
  const nested = route?.state;
  const routes = nested?.routes;
  if (!nested?.key || !routes || routes.length === 0) return false;
  const index = typeof nested.index === 'number' ? nested.index : 0;
  if (index === 0 && routes[0]?.name === 'index') return false;
  current.dispatch({
    type: 'POP_TO',
    target: nested.key,
    payload: { name: 'index', merge: false },
  });
  return true;
}
