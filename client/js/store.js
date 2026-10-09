// Estado centralizado do cliente. Telas só LEEM daqui e disparam "actions".
export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      state = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
      for (const fn of [...subs]) fn(state);
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
