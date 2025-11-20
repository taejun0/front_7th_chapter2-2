import type { AnyFunction } from "../types";
import { useCallback } from "./useCallback";
import { useRef } from "./useRef";

/**
 * 항상 최신 상태를 참조하면서도, 함수 자체의 참조는 변경되지 않는 콜백을 생성합니다.
 *
 * @param fn - 최신 상태를 참조할 함수
 * @returns 참조가 안정적인 콜백 함수
 */
export const useAutoCallback = <T extends AnyFunction>(fn: T): T => {
  const ref = useRef(fn);

  // 항상 최신 함수를 ref에 저장
  ref.current = fn;

  // 참조가 안정적인 래퍼 함수 반환
  return useCallback((...args: Parameters<T>) => {
    return ref.current(...args);
  }, []) as T;
};
