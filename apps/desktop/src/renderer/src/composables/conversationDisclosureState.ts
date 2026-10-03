import { computed, inject, provide, reactive, type InjectionKey } from "vue";

interface DisclosureContext {
  states: Map<string, boolean>;
  path: () => readonly string[];
}

const DISCLOSURE_CONTEXT: InjectionKey<DisclosureContext> = Symbol(
  "conversation-disclosure"
);

export function provideConversationDisclosureState(
  sessionId: () => string
): void {
  provide(DISCLOSURE_CONTEXT, {
    states: reactive(new Map()),
    path: () => [sessionId()]
  });
}

export function provideConversationDisclosureScope(id: () => string): void {
  const parent = inject(DISCLOSURE_CONTEXT, undefined);
  const states = parent?.states ?? reactive(new Map<string, boolean>());
  provide(DISCLOSURE_CONTEXT, {
    states,
    path: () => [...(parent?.path() ?? []), id()]
  });
}

export function useConversationDisclosure(id: () => string) {
  const parent = inject(DISCLOSURE_CONTEXT, undefined);
  const states = parent?.states ?? reactive(new Map<string, boolean>());
  const path = () => [...(parent?.path() ?? []), id()];
  return computed({
    get: () => states.get(JSON.stringify(path())) ?? false,
    set: (open: boolean) => {
      states.set(JSON.stringify(path()), open);
    }
  });
}

/**
 * 返回清理函数：清掉某个 scope（如一条消息）下所有手动展开记录。
 * 需在 setup 内调用以捕获注入的上下文；返回的闭包可在任意时机调用。
 */
export function useConversationDisclosureScopeClear(
  id: () => string
): () => void {
  const parent = inject(DISCLOSURE_CONTEXT, undefined);
  return () => {
    if (!parent) return;
    const scopeId = id();
    for (const key of [...parent.states.keys()]) {
      try {
        const path: unknown = JSON.parse(key);
        if (Array.isArray(path) && path.includes(scopeId)) {
          parent.states.delete(key);
        }
      } catch {
        // 忽略异常键
      }
    }
  };
}
