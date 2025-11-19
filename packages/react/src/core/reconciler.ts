import { context } from "./context";
import { Fragment, NodeTypes, TEXT_ELEMENT } from "./constants";
import { Instance, VNode } from "./types";
import {
  getDomNodes,
  getFirstDom,
  getFirstDomFromChildren,
  insertInstance,
  removeInstance,
  setDomProps,
  updateDomProps,
} from "./dom";
import { createChildPath, normalizeNode } from "./elements";
import { isEmptyValue } from "../utils";

/**
 * 컴포넌트를 마운트합니다.
 */
const mountComponent = (
  parentDom: HTMLElement,
  node: VNode,
  path: string,
  anchor: HTMLElement | Text | null = null,
): Instance | null => {
  const Component = node.type as React.ComponentType;
  const props = node.props;

  // 컴포넌트 경로 스택에 추가
  context.hooks.componentStack.push(path);
  context.hooks.cursor.set(path, 0);
  context.hooks.visited.add(path);

  try {
    // 컴포넌트 함수 실행
    const childNode = Component(props);

    // 자식 마운트
    const childInstance = childNode ? reconcile(parentDom, null, childNode, `${path}.c0`, anchor) : null;

    const instance: Instance = {
      kind: NodeTypes.COMPONENT,
      dom: null,
      node,
      children: childInstance ? [childInstance] : [],
      key: node.key,
      path,
    };

    // 첫 번째 DOM 노드 찾기
    instance.dom = getFirstDom(instance);

    return instance;
  } finally {
    context.hooks.componentStack.pop();
  }
};

/**
 * 컴포넌트를 업데이트합니다.
 */
const updateComponent = (parentDom: HTMLElement, instance: Instance, node: VNode, path: string): Instance => {
  console.log(`[updateComponent] path=${path}, prevChild=`, instance.children[0] ? instance.children[0].kind : "null");
  const Component = node.type as React.ComponentType;
  const props = node.props;

  // path가 변경되었을 때 상태 마이그레이션 (컴포넌트 경로 스택에 추가하기 전에)
  const oldPath = instance.path;
  if (oldPath !== path) {
    console.log(`[updateComponent] 상태 마이그레이션: oldPath=${oldPath}, newPath=${path}`);

    // hooks.state 마이그레이션
    if (context.hooks.state.has(oldPath)) {
      const oldState = context.hooks.state.get(oldPath)!;
      context.hooks.state.set(path, oldState);
      context.hooks.state.delete(oldPath);
      console.log(`[updateComponent] hooks.state 마이그레이션 완료: state.length=${oldState.length}`);
    }

    // hooks.cursor 마이그레이션
    if (context.hooks.cursor.has(oldPath)) {
      const oldCursor = context.hooks.cursor.get(oldPath)!;
      context.hooks.cursor.set(path, oldCursor);
      context.hooks.cursor.delete(oldPath);
      console.log(`[updateComponent] hooks.cursor 마이그레이션 완료: cursor=${oldCursor}`);
    }

    // visited에서도 업데이트
    if (context.hooks.visited.has(oldPath)) {
      context.hooks.visited.delete(oldPath);
      context.hooks.visited.add(path);
    }
  }

  // 컴포넌트 경로 스택에 추가
  context.hooks.componentStack.push(path);
  const prevCursor = context.hooks.cursor.get(path) ?? 0;
  context.hooks.cursor.set(path, 0);
  context.hooks.visited.add(path);

  try {
    // 컴포넌트 함수 재실행
    const rawChildNode = Component(props);
    console.log(
      `[updateComponent] rawChildNode=`,
      rawChildNode === null
        ? "null"
        : rawChildNode === false
          ? "false"
          : rawChildNode === undefined
            ? "undefined"
            : typeof rawChildNode,
      rawChildNode,
    );

    // childNode 정규화 (false, null, undefined 등을 null로 변환)
    const childNode = normalizeNode(rawChildNode);
    console.log(
      `[updateComponent] childNode after normalize=`,
      childNode === null ? "null" : childNode.type === Fragment ? "Fragment" : typeof childNode.type,
      childNode,
    );

    // 자식 재조정 - 컴포넌트의 자식은 부모 DOM에 직접 추가
    const prevChild = instance.children[0] ?? null;
    console.log(`[updateComponent] prevChild=`, prevChild ? prevChild.kind : "null", prevChild);

    // childNode가 null이면 reconcile을 호출하여 prevChild 제거
    // childNode의 children이 빈 배열이고 prevChild가 Fragment인 경우도 처리
    const shouldRemovePrevChild =
      childNode === null ||
      (childNode &&
        Array.isArray(childNode.props.children) &&
        childNode.props.children.length === 0 &&
        prevChild &&
        prevChild.kind === NodeTypes.FRAGMENT);

    console.log(
      `[updateComponent] reconcile 호출 전: childNode=`,
      childNode === null ? "null" : "not null",
      `prevChild=`,
      prevChild ? prevChild.kind : "null",
      `shouldRemovePrevChild=`,
      shouldRemovePrevChild,
      `childNode.children.length=`,
      childNode?.props?.children?.length ?? "N/A",
    );

    const childInstance = shouldRemovePrevChild
      ? reconcile(parentDom, prevChild, null, `${path}.c0`)
      : childNode
        ? reconcile(parentDom, prevChild, childNode, `${path}.c0`)
        : reconcile(parentDom, prevChild, null, `${path}.c0`);
    console.log(
      `[updateComponent] reconcile 호출 후: childInstance=`,
      childInstance ? childInstance.kind : "null",
      childInstance,
    );

    instance.node = node;
    instance.children = childInstance ? [childInstance] : [];
    instance.path = path; // path 명시적으로 업데이트

    // 첫 번째 DOM 노드 찾기
    instance.dom = getFirstDom(instance);

    return instance;
  } finally {
    context.hooks.componentStack.pop();
    context.hooks.cursor.set(path, prevCursor);
  }
};

/**
 * DOM 요소를 마운트합니다.
 */
const mountHost = (
  parentDom: HTMLElement,
  node: VNode,
  path: string,
  anchor: HTMLElement | Text | null = null,
): Instance => {
  const dom = document.createElement(node.type as string);
  setDomProps(dom, node.props);

  // ref 처리
  if (node.props.ref) {
    node.props.ref.current = dom;
  }

  // 자식 마운트
  const children: (Instance | null)[] = [];
  const childNodes = node.props.children || [];
  for (let i = 0; i < childNodes.length; i++) {
    const childNode = childNodes[i];
    const childPath = createChildPath(path, childNode.key, i, childNode.type, childNodes);
    const childInstance = reconcile(dom, null, childNode, childPath);
    children.push(childInstance);
  }

  // DOM에 추가
  if (anchor) {
    parentDom.insertBefore(dom, anchor);
  } else {
    parentDom.appendChild(dom);
  }

  const instance: Instance = {
    kind: NodeTypes.HOST,
    dom,
    node,
    children,
    key: node.key,
    path,
  };

  return instance;
};

/**
 * DOM 요소를 업데이트합니다.
 */
const updateHost = (parentDom: HTMLElement, instance: Instance, node: VNode, path: string): Instance => {
  console.log(
    `[updateHost] path=${path}, prevChildren=${instance.children.length}, nextChildren=${(node.props.children || []).length}`,
  );
  const dom = instance.dom as HTMLElement;
  updateDomProps(dom, instance.node.props, node.props);

  // ref 처리
  if (node.props.ref && node.props.ref !== instance.node.props.ref) {
    node.props.ref.current = dom;
  }

  // 자식 재조정
  const prevChildren = instance.children;
  const nextChildren = node.props.children || [];
  const newChildren: (Instance | null)[] = [];

  // key 기반 매핑 생성
  const keyedMap = new Map<string | null, Instance>();
  const usedPrevChildren = new Set<Instance>();

  for (const child of prevChildren) {
    if (child) {
      if (child.key !== null) {
        keyedMap.set(child.key, child);
      }
    }
  }

  // 먼저 모든 자식 인스턴스를 찾기 (재조정 전)
  const childInstances: (Instance | null)[] = [];
  const lastIndex = nextChildren.length - 1;

  for (let i = 0; i < nextChildren.length; i++) {
    const childNode = nextChildren[i];
    const childKey = childNode.key;
    let childInstance: Instance | null = null;

    if (childKey !== null) {
      // key가 있으면 key로 매칭
      childInstance = keyedMap.get(childKey) ?? null;
      if (childInstance) {
        usedPrevChildren.add(childInstance);
      }
    } else {
      // key가 없으면 path로 먼저 찾기
      const expectedPath = createChildPath(path, null, i, childNode.type, nextChildren);
      console.log(`[updateHost] path 매칭 시도 i=${i}, expectedPath=${expectedPath}, childNode.type=`, childNode.type);
      for (let j = 0; j < prevChildren.length; j++) {
        const prevChild = prevChildren[j];
        if (prevChild && !usedPrevChildren.has(prevChild) && prevChild.path === expectedPath) {
          childInstance = prevChild;
          usedPrevChildren.add(prevChild);
          console.log(`[updateHost] path 매칭 성공: i=${i}, prevChild.path=${prevChild.path}, prevChild.index=${j}`);
          break;
        }
      }

      // path로 찾지 못한 경우, 타입으로 찾기
      if (!childInstance) {
        const candidates: { instance: Instance; index: number }[] = [];
        for (let j = 0; j < prevChildren.length; j++) {
          const prevChild = prevChildren[j];
          if (prevChild && !usedPrevChildren.has(prevChild) && prevChild.key === null) {
            const prevNode = prevChild.node;
            if (prevNode.type === childNode.type) {
              candidates.push({ instance: prevChild, index: j });
            }
          }
        }

        if (candidates.length > 0) {
          // 마지막 위치이면 같은 타입의 마지막 자식을 우선 선택
          const isLastPosition = i === lastIndex;
          console.log(
            `[updateHost] i=${i}, isLastPosition=${isLastPosition}, candidates=${candidates.length}, childNode.type=`,
            childNode.type,
          );
          if (isLastPosition) {
            // Footer처럼 항상 마지막에 있는 컴포넌트를 위해
            // prevChildren의 마지막부터 역순으로 같은 타입을 찾기
            for (let j = prevChildren.length - 1; j >= 0; j--) {
              const prevChild = prevChildren[j];
              if (prevChild && !usedPrevChildren.has(prevChild) && prevChild.key === null) {
                const prevNode = prevChild.node;
                console.log(
                  `[updateHost] 역순 검색 j=${j}, prevNode.type=`,
                  prevNode.type,
                  `childNode.type=`,
                  childNode.type,
                  `match=${prevNode.type === childNode.type}`,
                );
                if (prevNode.type === childNode.type) {
                  childInstance = prevChild;
                  usedPrevChildren.add(childInstance);
                  console.log(
                    `[updateHost] 마지막 위치 매칭 성공: prevChild.path=${prevChild.path}, prevChild.index=${j}`,
                  );
                  break;
                }
              }
            }
            // 역순으로 찾지 못했으면 candidates에서 가장 큰 인덱스 선택
            if (!childInstance) {
              console.log(`[updateHost] 역순 검색 실패, candidates에서 선택`);
              let maxIndex = -1;
              for (const candidate of candidates) {
                if (candidate.index > maxIndex) {
                  maxIndex = candidate.index;
                  childInstance = candidate.instance;
                }
              }
              if (childInstance) {
                usedPrevChildren.add(childInstance);
                console.log(`[updateHost] candidates에서 선택: maxIndex=${maxIndex}`);
              }
            }
          } else {
            // 그 외의 경우 가장 가까운 후보 선택
            let bestCandidate = candidates[0];
            let minDistance = Math.abs(candidates[0].index - i);
            for (const candidate of candidates) {
              const distance = Math.abs(candidate.index - i);
              if (distance < minDistance) {
                minDistance = distance;
                bestCandidate = candidate;
              }
            }
            childInstance = bestCandidate.instance;
            usedPrevChildren.add(childInstance);
          }
        }
      }
    }
    childInstances.push(childInstance);
  }

  // 새 자식들을 역순으로 처리하여 anchor 계산
  // 재배치 시 DOM이 아직 이동되지 않았으므로, 재배치 후 위치의 다음 자식의 기존 DOM 위치를 anchor로 사용
  const anchors: (HTMLElement | Text | null)[] = new Array(nextChildren.length + 1);
  anchors[nextChildren.length] = null;

  // 재배치 후 위치를 기준으로 anchor 계산
  // 역순으로 처리하여 재배치 후 위치의 다음 자식의 기존 DOM 위치를 anchor로 사용
  for (let i = nextChildren.length - 1; i >= 0; i--) {
    let anchor: HTMLElement | Text | null = anchors[i + 1];

    if (i + 1 < nextChildren.length) {
      const nextChildNode = nextChildren[i + 1];
      const nextChildKey = nextChildNode.key;
      const nextChildInstance = childInstances[i + 1];

      console.log(
        `[updateHost] anchor 계산 i=${i}, nextChildKey=${nextChildKey}, nextChildInstance=`,
        nextChildInstance ? "exists" : "null",
      );

      // 재배치 후 위치의 다음 자식의 기존 DOM 위치를 anchor로 사용
      // 먼저 key로 기존 위치 찾기 (재배치 전 위치)
      if (nextChildKey !== null) {
        for (const prevChild of prevChildren) {
          if (prevChild && prevChild.key === nextChildKey) {
            const prevDom = getFirstDom(prevChild);
            if (prevDom && prevDom.parentNode === dom) {
              anchor = prevDom;
              console.log(
                `[updateHost] anchor 찾음 (prevChild key): i=${i}, key=${nextChildKey}, anchor=`,
                anchor,
                `prevDom.nextSibling=`,
                prevDom.nextSibling,
              );
              break;
            }
          }
        }
      }

      // key로 찾지 못한 경우, 재배치 후 위치의 자식의 기존 DOM 위치를 anchor로 사용
      if (anchor === anchors[i + 1] && nextChildInstance) {
        const nextDom = getFirstDom(nextChildInstance);
        if (nextDom && nextDom.parentNode === dom) {
          anchor = nextDom;
          console.log(
            `[updateHost] anchor 찾음 (nextChildInstance): i=${i}, anchor=`,
            anchor,
            `nextDom.nextSibling=`,
            nextDom.nextSibling,
          );
        }
      }
    }

    anchors[i] = anchor;
    console.log(`[updateHost] anchors[${i}]=`, anchor);
  }

  // 새 자식들을 처리
  console.log(`[updateHost] ========== 새 자식 처리 시작 ==========`);
  console.log(`[updateHost] nextChildren.length=${nextChildren.length}`);
  console.log(
    `[updateHost] 현재 DOM 순서 (처리 전):`,
    Array.from(dom.children).map(
      (c, idx) => `[${idx}] data-id=${(c as HTMLElement)?.getAttribute?.("data-id") ?? "no-id"}`,
    ),
  );

  for (let i = 0; i < nextChildren.length; i++) {
    const childNode = nextChildren[i];
    const childKey = childNode.key;
    const childPath = createChildPath(path, childKey, i, childNode.type, nextChildren);
    console.log(`[updateHost] ========== 자식 ${i} 처리 시작 ==========`);
    console.log(`[updateHost] 자식 ${i} 정보: key=${childKey}, path=${childPath}, type=`, childNode.type);
    console.log(
      `[updateHost] 자식 ${i} 처리 전 DOM 순서:`,
      Array.from(dom.children).map(
        (c, idx) => `[${idx}] data-id=${(c as HTMLElement)?.getAttribute?.("data-id") ?? "no-id"}`,
      ),
    );

    let childInstance: Instance | null = childInstances[i];
    console.log(
      `[updateHost] 자식 ${i} childInstance=`,
      childInstance ? childInstance.kind : "null",
      `key=`,
      childInstance?.key,
    );

    if (childInstance && childKey !== null) {
      keyedMap.delete(childKey);
      console.log(`[updateHost] 자식 ${i} keyedMap에서 삭제: key=${childKey}`);
    }

    // anchor 가져오기
    const anchor = anchors[i];
    console.log(`[updateHost] 자식 ${i} anchor=`, anchor);

    // 재조정 (anchor 사용)
    // 재배치가 필요한 경우, 먼저 DOM을 올바른 위치로 이동한 후 재조정
    if (childInstance && childKey !== null && childInstance.key === childKey) {
      // key가 있는 경우, 재배치가 필요한지 확인
      const currentDom = getFirstDom(childInstance);
      console.log(
        `[updateHost] 자식 ${i} key 재배치 체크: currentDom=`,
        currentDom,
        `parentNode=`,
        currentDom?.parentNode,
        `dom=`,
        dom,
      );
      if (currentDom && currentDom.parentNode === dom) {
        const currentNextSibling = currentDom.nextSibling;
        console.log(
          `[updateHost] 자식 ${i} key 재배치 체크: key=${childKey}, currentNextSibling=`,
          currentNextSibling,
          `anchor=`,
          anchor,
        );
        // anchor 앞에 삽입해야 함
        if (anchor !== null) {
          // anchor가 현재 DOM의 다음 형제와 다르면 이동 필요
          // 또는 현재 DOM이 anchor의 이전 형제가 아니면 이동 필요 (현재 DOM이 anchor 바로 앞에 있지 않으면)
          const anchorPrevSibling = anchor.previousSibling;
          const currentPrevSibling = currentDom.previousSibling;
          // currentNextSibling === anchor이지만, currentDom !== anchorPrevSibling이면 이동 필요
          // 또는 currentDom이 첫 번째 위치가 아니면 이동 필요 (currentPrevSibling이 있으면)
          const needsMove =
            currentNextSibling !== anchor || currentDom !== anchorPrevSibling || currentPrevSibling !== null;

          console.log(
            `[updateHost] 자식 ${i} 이동 필요성 체크:`,
            `currentPrevSibling.data-id=${(currentPrevSibling as HTMLElement)?.getAttribute?.("data-id") ?? "null"}`,
            `anchorPrevSibling.data-id=${(anchorPrevSibling as HTMLElement)?.getAttribute?.("data-id") ?? "null"}`,
            `currentDom === anchorPrevSibling:`,
            currentDom === anchorPrevSibling,
            `currentPrevSibling !== null:`,
            currentPrevSibling !== null,
            `needsMove:`,
            needsMove,
          );

          if (needsMove) {
            console.log(
              `[updateHost] 자식 ${i} DOM 이동: insertBefore key=${childKey}, anchor=`,
              anchor,
              `anchor.data-id=${(anchor as HTMLElement)?.getAttribute?.("data-id")}`,
              `currentDom=`,
              currentDom,
              `currentDom.data-id=${(currentDom as HTMLElement)?.getAttribute?.("data-id")}`,
            );
            console.log(
              `[updateHost] 자식 ${i} DOM 이동 전 순서:`,
              Array.from(dom.children).map(
                (c, idx) => `[${idx}] data-id=${(c as HTMLElement)?.getAttribute?.("data-id") ?? "no-id"}`,
              ),
            );
            console.log(
              `[updateHost] 자식 ${i} insertBefore 호출: currentDom.data-id=${(currentDom as HTMLElement)?.getAttribute?.("data-id")}, anchor.data-id=${(anchor as HTMLElement)?.getAttribute?.("data-id")}`,
            );

            // insertBefore는 currentDom이 이미 anchor 앞에 있으면 아무 효과가 없습니다.
            // 하지만 currentDom이 첫 번째 위치가 아니면 (currentPrevSibling이 있으면) 이동이 필요합니다.
            const anchorPrevSibling = anchor.previousSibling;
            const currentPrevSibling = currentDom.previousSibling;

            console.log(
              `[updateHost] 자식 ${i} insertBefore 체크:`,
              `currentDom === anchorPrevSibling:`,
              currentDom === anchorPrevSibling,
              `currentPrevSibling:`,
              currentPrevSibling ? `data-id=${(currentPrevSibling as HTMLElement)?.getAttribute?.("data-id")}` : "null",
              `anchorPrevSibling:`,
              anchorPrevSibling ? `data-id=${(anchorPrevSibling as HTMLElement)?.getAttribute?.("data-id")}` : "null",
            );

            // currentDom이 anchor의 이전 형제가 아니거나, currentDom이 첫 번째 위치가 아니면 이동 필요
            if (currentDom !== anchorPrevSibling || currentPrevSibling !== null) {
              // currentDom이 첫 번째 위치로 이동해야 하면, anchor를 첫 번째 자식으로 변경
              if (currentPrevSibling !== null && i === 0) {
                // 첫 번째 위치로 이동: anchor를 첫 번째 자식으로 설정
                const firstChild = dom.firstElementChild;
                if (firstChild && firstChild !== currentDom) {
                  console.log(`[updateHost] 자식 ${i} 첫 번째 위치로 이동: anchor를 첫 번째 자식으로 변경`);
                  dom.insertBefore(currentDom, firstChild);
                } else {
                  console.log(`[updateHost] 자식 ${i} 이미 첫 번째 위치`);
                }
              } else {
                dom.insertBefore(currentDom, anchor);
                console.log(`[updateHost] 자식 ${i} insertBefore 실행됨`);
              }
            } else {
              console.log(
                `[updateHost] 자식 ${i} insertBefore 스킵: currentDom이 이미 anchor의 이전 형제이고 첫 번째 위치`,
              );
            }

            console.log(
              `[updateHost] 자식 ${i} DOM 이동 완료: nextSibling=`,
              currentDom.nextSibling,
              `nextSibling.data-id=${(currentDom.nextSibling as HTMLElement)?.getAttribute?.("data-id") ?? "null"}`,
            );
            console.log(
              `[updateHost] 자식 ${i} DOM 이동 후 순서:`,
              Array.from(dom.children).map(
                (c, idx) => `[${idx}] data-id=${(c as HTMLElement)?.getAttribute?.("data-id") ?? "no-id"}`,
              ),
            );
          } else {
            console.log(`[updateHost] 자식 ${i} DOM 이동 불필요: key=${childKey}, 이미 올바른 위치`);
          }
        } else {
          // anchor가 null이면 마지막에 삽입
          // 하지만 현재 DOM이 이미 마지막이 아닌 경우에만 이동
          if (currentNextSibling !== null) {
            console.log(
              `[updateHost] 자식 ${i} DOM 이동: appendChild key=${childKey}, currentNextSibling=`,
              currentNextSibling,
            );
            console.log(
              `[updateHost] 자식 ${i} DOM 이동 전 순서:`,
              Array.from(dom.children).map(
                (c, idx) => `[${idx}] data-id=${(c as HTMLElement)?.getAttribute?.("data-id") ?? "no-id"}`,
              ),
            );
            dom.appendChild(currentDom);
            console.log(`[updateHost] 자식 ${i} DOM 이동 완료: nextSibling=`, currentDom.nextSibling);
            console.log(
              `[updateHost] 자식 ${i} DOM 이동 후 순서:`,
              Array.from(dom.children).map(
                (c, idx) => `[${idx}] data-id=${(c as HTMLElement)?.getAttribute?.("data-id") ?? "no-id"}`,
              ),
            );
          } else {
            console.log(`[updateHost] 자식 ${i} DOM 이동 불필요: key=${childKey}, 이미 마지막`);
          }
        }
      }
    }

    console.log(
      `[updateHost] 자식 ${i} reconcile 호출 전: childInstance=`,
      childInstance,
      `childNode=`,
      childNode,
      `anchor=`,
      anchor,
    );
    console.log(
      `[updateHost] 자식 ${i} reconcile 호출 전 DOM 순서:`,
      Array.from(dom.children).map(
        (c, idx) => `[${idx}] data-id=${(c as HTMLElement)?.getAttribute?.("data-id") ?? "no-id"}`,
      ),
    );
    childInstance = reconcile(dom, childInstance, childNode, childPath, anchor);
    console.log(`[updateHost] 자식 ${i} reconcile 호출 후: childInstance=`, childInstance);
    console.log(
      `[updateHost] 자식 ${i} reconcile 호출 후 DOM 순서:`,
      Array.from(dom.children).map(
        (c, idx) => `[${idx}] data-id=${(c as HTMLElement)?.getAttribute?.("data-id") ?? "no-id"}`,
      ),
    );

    // 재조정 후 인스턴스의 path 업데이트 (경로가 변경되었을 수 있음)
    if (childInstance && childInstance.path !== childPath) {
      console.log(`[updateHost] 자식 ${i} path 업데이트: ${childInstance.path} -> ${childPath}`);
      childInstance.path = childPath;
    }

    newChildren.push(childInstance);
    console.log(`[updateHost] ========== 자식 ${i} 처리 완료 ==========`);
    console.log(
      `[updateHost] 자식 ${i} 처리 후 현재 DOM 순서:`,
      Array.from(dom.children).map(
        (c, idx) => `[${idx}] data-id=${(c as HTMLElement)?.getAttribute?.("data-id") ?? "no-id"}`,
      ),
    );
  }

  console.log(`[updateHost] ========== 새 자식 처리 완료 ==========`);
  console.log(
    `[updateHost] 최종 DOM 순서:`,
    Array.from(dom.children).map(
      (c, idx) => `[${idx}] data-id=${(c as HTMLElement)?.getAttribute?.("data-id") ?? "no-id"}`,
    ),
  );

  // 사용되지 않은 자식 제거
  console.log(
    `[updateHost] 사용되지 않은 자식 제거 시작: prevChildren.length=${prevChildren.length}, usedPrevChildren.size=${usedPrevChildren.size}`,
  );
  for (let i = 0; i < prevChildren.length; i++) {
    const child = prevChildren[i];
    if (child && !usedPrevChildren.has(child)) {
      console.log(
        `[updateHost] 사용되지 않은 자식 ${i} 제거: kind=`,
        child.kind,
        `key=`,
        child.key,
        `child=`,
        child,
        `children.length=`,
        child.children.length,
      );
      if (child.kind === NodeTypes.FRAGMENT) {
        console.log(`[updateHost] Fragment 자식들:`, child.children);
        for (let k = 0; k < child.children.length; k++) {
          const fragmentChild = child.children[k];
          console.log(`[updateHost] Fragment 자식 ${k}:`, fragmentChild ? fragmentChild.kind : "null", fragmentChild);
        }
      }
      const nodes = getDomNodes(child);
      console.log(`[updateHost] 사용되지 않은 자식 ${i} DOM 노드: nodes.length=${nodes.length}`, `nodes=`, nodes);
      for (let j = 0; j < nodes.length; j++) {
        const node = nodes[j];
        console.log(
          `[updateHost] 사용되지 않은 자식 ${i} DOM ${j} 제거: node=`,
          node,
          `parentNode=`,
          node.parentNode,
          `dom=`,
          dom,
        );
        if (node.parentNode === dom) {
          dom.removeChild(node);
          console.log(`[updateHost] 사용되지 않은 자식 ${i} DOM ${j} 제거 완료`);
        } else {
          console.log(`[updateHost] 사용되지 않은 자식 ${i} DOM ${j} 제거 스킵: parentNode !== dom`);
        }
      }
    }
  }
  console.log(`[updateHost] keyedMap에서 사용되지 않은 자식 제거: keyedMap.size=${keyedMap.size}`);
  for (const unusedChild of keyedMap.values()) {
    console.log(
      `[updateHost] keyedMap에서 사용되지 않은 자식 제거: kind=`,
      unusedChild.kind,
      `key=`,
      unusedChild.key,
      `child=`,
      unusedChild,
    );
    const nodes = getDomNodes(unusedChild);
    console.log(`[updateHost] keyedMap에서 사용되지 않은 자식 DOM 노드: nodes.length=${nodes.length}`, `nodes=`, nodes);
    for (let j = 0; j < nodes.length; j++) {
      const node = nodes[j];
      console.log(
        `[updateHost] keyedMap에서 사용되지 않은 자식 DOM ${j} 제거: node=`,
        node,
        `parentNode=`,
        node.parentNode,
        `dom=`,
        dom,
      );
      if (node.parentNode === dom) {
        dom.removeChild(node);
        console.log(`[updateHost] keyedMap에서 사용되지 않은 자식 DOM ${j} 제거 완료`);
      } else {
        console.log(`[updateHost] keyedMap에서 사용되지 않은 자식 DOM ${j} 제거 스킵: parentNode !== dom`);
      }
    }
  }

  instance.node = node;
  instance.children = newChildren;
  instance.path = path; // path 명시적으로 업데이트

  return instance;
};

/**
 * Fragment를 마운트합니다.
 */
const mountFragment = (
  parentDom: HTMLElement,
  node: VNode,
  path: string,
  anchor: HTMLElement | Text | null = null,
): Instance => {
  const children: (Instance | null)[] = [];
  const childNodes = node.props.children || [];

  // Fragment의 자식들을 역순으로 처리하여 anchor 계산
  let currentAnchor = anchor;
  const instances: (Instance | null)[] = new Array(childNodes.length);

  for (let i = childNodes.length - 1; i >= 0; i--) {
    const childNode = childNodes[i];
    const childPath = createChildPath(path, childNode.key, i, childNode.type, childNodes);
    const childInstance = reconcile(parentDom, null, childNode, childPath, currentAnchor);
    instances[i] = childInstance;
    if (childInstance) {
      const childDom = getFirstDom(childInstance);
      if (childDom) {
        currentAnchor = childDom;
      }
    }
  }

  // children 배열 구성
  for (let i = 0; i < instances.length; i++) {
    children.push(instances[i]);
  }

  const instance: Instance = {
    kind: NodeTypes.FRAGMENT,
    dom: null,
    node,
    children,
    key: node.key,
    path,
  };

  instance.dom = getFirstDom(instance);

  return instance;
};

/**
 * Fragment를 업데이트합니다.
 */
const updateFragment = (parentDom: HTMLElement, instance: Instance, node: VNode, path: string): Instance => {
  const prevChildren = instance.children;
  const nextChildren = node.props.children || [];
  const newChildren: (Instance | null)[] = [];

  // key 기반 매핑 생성
  const keyedMap = new Map<string | null, Instance>();
  const usedPrevChildren = new Set<Instance>();

  for (const child of prevChildren) {
    if (child) {
      if (child.key !== null) {
        keyedMap.set(child.key, child);
      }
    }
  }

  // 먼저 모든 자식 인스턴스를 찾기 (재조정 전)
  const childInstances: (Instance | null)[] = [];

  for (let i = 0; i < nextChildren.length; i++) {
    const childNode = nextChildren[i];
    const childKey = childNode.key;
    let childInstance: Instance | null = null;

    if (childKey !== null) {
      childInstance = keyedMap.get(childKey) ?? null;
      if (childInstance) {
        usedPrevChildren.add(childInstance);
      }
    } else {
      const expectedPath = createChildPath(path, null, i, childNode.type, nextChildren);
      for (let j = 0; j < prevChildren.length; j++) {
        const prevChild = prevChildren[j];
        if (prevChild && !usedPrevChildren.has(prevChild) && prevChild.path === expectedPath) {
          childInstance = prevChild;
          usedPrevChildren.add(prevChild);
          break;
        }
      }
    }
    childInstances[i] = childInstance;
  }

  // 새 자식들을 역순으로 처리하여 anchor 계산
  const anchors: (HTMLElement | Text | null)[] = new Array(nextChildren.length + 1);
  anchors[nextChildren.length] = null;

  for (let i = nextChildren.length - 1; i >= 0; i--) {
    let anchor: HTMLElement | Text | null = anchors[i + 1];

    if (i + 1 < nextChildren.length) {
      const nextChildInstance = childInstances[i + 1];
      if (nextChildInstance) {
        const nextDom = getFirstDom(nextChildInstance);
        if (nextDom && nextDom.parentNode === parentDom) {
          anchor = nextDom;
        }
      }

      // DOM을 찾지 못한 경우, key로 기존 위치 찾기
      if (anchor === anchors[i + 1]) {
        const nextChildKey = nextChildren[i + 1].key;
        if (nextChildKey !== null) {
          for (const prevChild of prevChildren) {
            if (prevChild && prevChild.key === nextChildKey) {
              const prevDom = getFirstDom(prevChild);
              if (prevDom && prevDom.parentNode === parentDom) {
                anchor = prevDom;
                break;
              }
            }
          }
        }
      }
    }

    anchors[i] = anchor;
  }

  // 새 자식들을 처리
  for (let i = 0; i < nextChildren.length; i++) {
    const childNode = nextChildren[i];
    const childKey = childNode.key;
    const childPath = createChildPath(path, childKey, i, childNode.type, nextChildren);

    let childInstance: Instance | null = childInstances[i];

    if (childInstance && childKey !== null) {
      keyedMap.delete(childKey);
    }

    const anchor = anchors[i];
    childInstance = reconcile(parentDom, childInstance, childNode, childPath, anchor);

    // 재조정 후 인스턴스의 path 업데이트 (경로가 변경되었을 수 있음)
    if (childInstance && childInstance.path !== childPath) {
      childInstance.path = childPath;
    }

    newChildren.push(childInstance);
  }

  // 사용되지 않은 자식 제거
  for (const child of prevChildren) {
    if (child && !usedPrevChildren.has(child)) {
      const nodes = getDomNodes(child);
      for (const node of nodes) {
        if (node.parentNode === parentDom) {
          parentDom.removeChild(node);
        }
      }
    }
  }
  for (const unusedChild of keyedMap.values()) {
    const nodes = getDomNodes(unusedChild);
    for (const node of nodes) {
      if (node.parentNode === parentDom) {
        parentDom.removeChild(node);
      }
    }
  }

  instance.node = node;
  instance.children = newChildren;
  instance.dom = getFirstDom(instance);
  instance.path = path; // path 명시적으로 업데이트

  return instance;
};

/**
 * 텍스트 노드를 마운트합니다.
 */
const mountText = (parentDom: HTMLElement, node: VNode, anchor: HTMLElement | Text | null = null): Instance => {
  const textNode = document.createTextNode(node.props.nodeValue);
  if (anchor) {
    parentDom.insertBefore(textNode, anchor);
  } else {
    parentDom.appendChild(textNode);
  }

  return {
    kind: NodeTypes.TEXT,
    dom: textNode,
    node,
    children: [],
    key: node.key,
    path: "",
  };
};

/**
 * 텍스트 노드를 업데이트합니다.
 */
const updateText = (instance: Instance, node: VNode): Instance => {
  if (instance.dom) {
    (instance.dom as Text).nodeValue = node.props.nodeValue;
  }
  instance.node = node;
  // path는 변경되지 않으므로 업데이트 불필요
  return instance;
};

/**
 * 이전 인스턴스와 새로운 VNode를 비교하여 DOM을 업데이트하는 재조정 과정을 수행합니다.
 *
 * @param parentDom - 부모 DOM 요소
 * @param instance - 이전 렌더링의 인스턴스
 * @param node - 새로운 VNode
 * @param path - 현재 노드의 고유 경로
 * @param anchor - DOM 삽입 위치 (선택적)
 * @returns 업데이트되거나 새로 생성된 인스턴스
 */
export const reconcile = (
  parentDom: HTMLElement,
  instance: Instance | null,
  node: VNode | null,
  path: string,
  anchor: HTMLElement | Text | null = null,
): Instance | null => {
  console.log(
    `[reconcile] START path=${path}, instance=`,
    instance ? instance.kind : "null",
    `node=`,
    node ? (node.type === Fragment ? "Fragment" : typeof node.type) : "null",
    `instance=`,
    instance,
    `node=`,
    node,
  );
  // 1. 새 노드가 null이면 기존 인스턴스를 제거
  if (node === null) {
    console.log(
      `[reconcile] node가 null, instance 제거 시작: path=${path}, instance.kind=`,
      instance?.kind,
      `instance=`,
      instance,
    );
    if (instance) {
      // Fragment의 경우 모든 자식을 명시적으로 제거
      if (instance.kind === NodeTypes.FRAGMENT) {
        console.log(
          `[reconcile] Fragment 자식 제거 시작: children.length=${instance.children.length}`,
          `children=`,
          instance.children,
        );
        for (let i = 0; i < instance.children.length; i++) {
          const child = instance.children[i];
          if (child) {
            console.log(`[reconcile] Fragment 자식 ${i} 처리: kind=`, child.kind, `child=`, child);
            const nodes = getDomNodes(child);
            console.log(`[reconcile] Fragment 자식 ${i} DOM 제거: nodes.length=${nodes.length}`, `nodes=`, nodes);
            for (let j = 0; j < nodes.length; j++) {
              const domNode = nodes[j];
              console.log(
                `[reconcile] Fragment 자식 ${i} DOM ${j} 제거: domNode=`,
                domNode,
                `parentNode=`,
                domNode.parentNode,
                `parentDom=`,
                parentDom,
              );
              if (domNode.parentNode === parentDom) {
                parentDom.removeChild(domNode);
                console.log(`[reconcile] Fragment 자식 ${i} DOM ${j} 제거 완료`);
              } else {
                console.log(`[reconcile] Fragment 자식 ${i} DOM ${j} 제거 스킵: parentNode !== parentDom`);
              }
            }
          }
        }
        console.log(`[reconcile] Fragment 자식 제거 완료`);
      } else {
        console.log(`[reconcile] removeInstance 호출: instance.kind=`, instance.kind);
        removeInstance(parentDom, instance);
      }
    }
    console.log(`[reconcile] node가 null 처리 완료, null 반환`);
    return null;
  }

  // 2. 기존 인스턴스가 없으면 새로 마운트
  if (instance === null) {
    if (node.type === TEXT_ELEMENT) {
      return mountText(parentDom, node, anchor);
    }
    if (node.type === Fragment) {
      return mountFragment(parentDom, node, path, anchor);
    }
    if (typeof node.type === "function") {
      return mountComponent(parentDom, node, path, anchor);
    }
    return mountHost(parentDom, node, path, anchor);
  }

  // 3. 타입이나 키가 다르면 기존 인스턴스를 제거하고 새로 마운트
  if (instance.node.type !== node.type || instance.key !== node.key) {
    removeInstance(parentDom, instance);
    if (node.type === TEXT_ELEMENT) {
      return mountText(parentDom, node, anchor);
    }
    if (node.type === Fragment) {
      return mountFragment(parentDom, node, path, anchor);
    }
    if (typeof node.type === "function") {
      return mountComponent(parentDom, node, path, anchor);
    }
    return mountHost(parentDom, node, path, anchor);
  }

  // 4. 타입과 키가 같으면 업데이트
  let updatedInstance: Instance;
  if (node.type === TEXT_ELEMENT) {
    updatedInstance = updateText(instance, node);
  } else if (node.type === Fragment) {
    updatedInstance = updateFragment(parentDom, instance, node, path);
  } else if (typeof node.type === "function") {
    updatedInstance = updateComponent(parentDom, instance, node, path);
  } else {
    updatedInstance = updateHost(parentDom, instance, node, path);
  }

  // path가 변경되었을 때 상태 마이그레이션 (컴포넌트인 경우만)
  // path 업데이트 전에 상태를 마이그레이션해야 함
  const oldPath = updatedInstance.path;
  if (oldPath !== path && updatedInstance.kind === NodeTypes.COMPONENT) {
    console.log(`[reconcile] 상태 마이그레이션: oldPath=${oldPath}, newPath=${path}`);

    // hooks.state 마이그레이션
    if (context.hooks.state.has(oldPath)) {
      const oldState = context.hooks.state.get(oldPath)!;
      context.hooks.state.set(path, oldState);
      context.hooks.state.delete(oldPath);
      console.log(`[reconcile] hooks.state 마이그레이션 완료: state.length=${oldState.length}`);
    }

    // hooks.cursor 마이그레이션
    if (context.hooks.cursor.has(oldPath)) {
      const oldCursor = context.hooks.cursor.get(oldPath)!;
      context.hooks.cursor.set(path, oldCursor);
      context.hooks.cursor.delete(oldPath);
      console.log(`[reconcile] hooks.cursor 마이그레이션 완료: cursor=${oldCursor}`);
    }

    // visited에서도 업데이트
    if (context.hooks.visited.has(oldPath)) {
      context.hooks.visited.delete(oldPath);
      context.hooks.visited.add(path);
    }
  }

  // path 명시적으로 업데이트
  updatedInstance.path = path;

  return updatedInstance;
};
