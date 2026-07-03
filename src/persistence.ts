import { listen, Reactive, ReactiveValue, Unsub, val } from "reroi";

export interface Persistence {
  persist<T>(key: string, entity: Reactive<T>, serializer?: (val: T) => string): void;
  rise<T>(key: string, deserialize: (persisted: string) => T, fallback: T): ReactiveValue<T>;
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function initPersistence(): Persistence {
  const registry: Map<string, Unsub> = new Map();

  return {
    persist(key, entity, serializer) {
      const persisted = localStorage.getItem(key)

      const un = listen(entity, value => {
        const serialized = serializer ? serializer(value) : (value + '');
        localStorage.setItem(key, serialized);
      }, { immidiate: !Boolean(persisted) });

      registry.set(key, un);
    },
    rise(key, deserialize, fallback) {
      const persisted = localStorage.getItem(key);

      if (persisted) {
        return val(deserialize(persisted));
      } else {
        return val(fallback);
      }
    },
    get(key) {
      return localStorage.getItem(key);
    },
    set(key, value) {
      return localStorage.setItem(key, value);
    },
  }
}
