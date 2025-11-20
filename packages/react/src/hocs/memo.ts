import { useRef } from "../hooks";
import { type FunctionComponent, type VNode } from "../core";
import { shallowEquals } from "../utils";

/**
 * 컴포넌트의 props가 변경되지 않았을 경우, 마지막 렌더링 결과를 재사용하여
 * 리렌더링을 방지하는 고차 컴포넌트(HOC)입니다.
 *
 * @param Component - 메모이제이션할 컴포넌트
 * @param equals - props를 비교할 함수 (기본값: shallowEquals)
 * @returns 메모이제이션이 적용된 새로운 컴포넌트
 */
export function memo<P extends object>(Component: FunctionComponent<P>, equals = shallowEquals) {
  const MemoizedComponent: FunctionComponent<P> = (props) => {
    const ref = useRef<{ prevProps: P | null; prevResult: VNode | null } | null>(null);

    if (ref.current === null || !equals(ref.current.prevProps, props)) {
      const result = Component(props);
      ref.current = {
        prevProps: props,
        prevResult: result,
      };
      return result;
    }

    return ref.current.prevResult;
  };

  MemoizedComponent.displayName = `Memo(${Component.displayName || Component.name})`;

  return MemoizedComponent;
}
