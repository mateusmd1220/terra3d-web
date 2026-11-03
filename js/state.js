// Store mínimo (imutável por substituição) com assinaturas.
export function createStore(initial) {
  let s = { ...initial };
  const subs = new Set();
  return {
    get: () => s,
    set(patch) {
      const prev = s;
      s = { ...s, ...patch };
      for (const f of subs) f(s, prev);
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}
