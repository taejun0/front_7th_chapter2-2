import { shallowEquals, withEnqueue } from "../utils";
import { context } from "./context";
import { EffectHook } from "./types";
import { enqueueRender } from "./render";
import { HookTypes } from "./constants";
import { enqueue } from "../utils/enqueue";

/**
 * 사용되지 않는 컴포넌트의 훅 상태와 이펙트 클린업 함수를 정리합니다.
 */
export const cleanupUnusedHooks = () => {
  const { hooks } = context;
  const visited = hooks.visited;

  // 방문하지 않은 컴포넌트의 훅 정리
  for (const [path, hooksArray] of hooks.state.entries()) {
    if (!visited.has(path)) {
      // 이펙트 클린업 실행
      for (const hook of hooksArray) {
        if (hook && typeof hook === "object" && "kind" in hook && hook.kind === HookTypes.EFFECT) {
          const effectHook = hook as EffectHook;
          if (effectHook.cleanup) {
            effectHook.cleanup();
          }
        }
      }

      hooks.state.delete(path);
      hooks.cursor.delete(path);
    }
  }

  // visited 초기화
  hooks.visited.clear();
};

/**
 * 컴포넌트의 상태를 관리하기 위한 훅입니다.
 * @param initialValue - 초기 상태 값 또는 초기 상태를 반환하는 함수
 * @returns [현재 상태, 상태를 업데이트하는 함수]
 */
export const useState = <T>(initialValue: T | (() => T)): [T, (nextValue: T | ((prev: T) => T)) => void] => {
  const path = context.hooks.currentPath;
  const cursor = context.hooks.currentCursor;
  const hooks = context.hooks.currentHooks;

  // 첫 렌더링이면 초기값 설정
  if (cursor >= hooks.length) {
    const value = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    hooks.push(value);
    context.hooks.state.set(path, hooks);
  }

  const currentValue = hooks[cursor] as T;

  // 상태 변경 함수
  const setState = (nextValue: T | ((prev: T) => T)) => {
    const hooks = context.hooks.state.get(path) || [];
    const currentValue = hooks[cursor] as T;

    // 새 값 계산
    const newValue = typeof nextValue === "function" ? (nextValue as (prev: T) => T)(currentValue) : nextValue;

    // 값이 같으면 재렌더링 건너뛰기
    if (Object.is(currentValue, newValue)) {
      return;
    }

    // 상태 업데이트
    hooks[cursor] = newValue;
    context.hooks.state.set(path, hooks);

    // 재렌더링 예약
    enqueueRender();
  };

  // 커서 증가
  context.hooks.cursor.set(path, cursor + 1);

  return [currentValue, setState];
};

/**
 * 컴포넌트의 사이드 이펙트를 처리하기 위한 훅입니다.
 * @param effect - 실행할 이펙트 함수. 클린업 함수를 반환할 수 있습니다.
 * @param deps - 의존성 배열. 이 값들이 변경될 때만 이펙트가 다시 실행됩니다.
 */
export const useEffect = (effect: () => (() => void) | void, deps?: unknown[]): void => {
  const path = context.hooks.currentPath;
  const cursor = context.hooks.currentCursor;
  const hooks = context.hooks.currentHooks;

  // 이전 훅 가져오기
  let prevHook: EffectHook | undefined;
  if (cursor < hooks.length) {
    const hook = hooks[cursor];
    if (hook && typeof hook === "object" && "kind" in hook && hook.kind === HookTypes.EFFECT) {
      prevHook = hook as EffectHook;
    }
  }

  // 의존성 비교
  const shouldRun = !prevHook || !deps || !shallowEquals(prevHook.deps, deps);

  // 이펙트 훅 생성/업데이트
  const effectHook: EffectHook = {
    kind: HookTypes.EFFECT,
    deps: deps ?? null,
    cleanup: prevHook?.cleanup ?? null,
    effect,
  };

  // 훅 저장
  if (cursor >= hooks.length) {
    hooks.push(effectHook);
  } else {
    hooks[cursor] = effectHook;
  }
  context.hooks.state.set(path, hooks);

  // 이펙트 실행 예약
  if (shouldRun) {
    context.effects.queue.push({ path, cursor });
  }

  // 커서 증가
  context.hooks.cursor.set(path, cursor + 1);
};
