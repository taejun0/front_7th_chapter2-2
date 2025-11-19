import { context } from "./context";
import { reconcile } from "./reconciler";
import { cleanupUnusedHooks } from "./hooks";
import { withEnqueue, enqueue } from "../utils";

/**
 * 루트 컴포넌트의 렌더링을 수행하는 함수입니다.
 * `enqueueRender`에 의해 스케줄링되어 호출됩니다.
 */
export const render = (): void => {
  const { root } = context;

  if (!root.container || !root.node) {
    return;
  }

  // 1. 훅 컨텍스트 초기화 (state는 유지, cursor만 초기화)
  context.hooks.cursor.clear();
  context.hooks.componentStack = [];
  context.effects.queue = [];

  // 2. reconcile 함수 호출하여 루트 노드 재조정
  const newInstance = reconcile(root.container, root.instance, root.node, "0");

  // 3. 루트 인스턴스 업데이트
  root.instance = newInstance;

  // 4. 사용되지 않은 훅 정리
  cleanupUnusedHooks();

  // 5. 이펙트를 비동기로 실행
  enqueue(flushEffects);
};

/**
 * 이펙트 큐를 실행합니다.
 */
const flushEffects = () => {
  const { queue } = context.effects;
  while (queue.length > 0) {
    const { path, cursor } = queue.shift()!;
    const hooks = context.hooks.state.get(path);
    if (hooks) {
      const hook = hooks[cursor];
      if (hook && "kind" in hook && hook.kind === "effect") {
        // 이전 cleanup 실행
        if (hook.cleanup) {
          hook.cleanup();
        }

        // 새 effect 실행
        const cleanup = hook.effect();
        hook.cleanup = typeof cleanup === "function" ? cleanup : null;
      }
    }
  }
};

/**
 * `render` 함수를 마이크로태스크 큐에 추가하여 중복 실행을 방지합니다.
 */
export const enqueueRender = withEnqueue(render);
