import { context } from "./context";
import { VNode } from "./types";
import { removeInstance } from "./dom";
import { render } from "./render";

/**
 * Mini-React 애플리케이션의 루트를 설정하고 첫 렌더링을 시작합니다.
 *
 * @param rootNode - 렌더링할 최상위 VNode
 * @param container - VNode가 렌더링될 DOM 컨테이너
 */
export const setup = (rootNode: VNode | null, container: HTMLElement): void => {
  // 1. 컨테이너 유효성 검사
  if (!container) {
    throw new Error("컨테이너가 필요합니다");
  }

  // 2. null 루트 노드 검사
  if (rootNode === null) {
    throw new Error("null 루트 엘리먼트는 렌더할 수 없습니다");
  }

  // 3. 이전 렌더링 내용 정리
  if (context.root.instance) {
    removeInstance(container, context.root.instance);
  }
  container.innerHTML = "";

  // 4. 루트 컨텍스트와 훅 컨텍스트 리셋
  context.root.reset({ container, node: rootNode });
  context.hooks.clear();
  context.effects.queue = [];

  // 5. 첫 렌더링 실행
  render();
};
