/* eslint-disable @typescript-eslint/no-explicit-any */
import { NodeTypes } from "./constants";
import { Instance } from "./types";

/**
 * 이벤트 핸들러 이름을 정규화합니다 (onClick -> click)
 */
const normalizeEventName = (name: string): string => {
  return name.slice(2).toLowerCase();
};

/**
 * 이벤트 핸들러인지 확인합니다.
 */
const isEventProp = (name: string): boolean => {
  return name.startsWith("on") && name.length > 2;
};

/**
 * DOM 요소에 속성(props)을 설정합니다.
 * 이벤트 핸들러, 스타일, className 등 다양한 속성을 처리해야 합니다.
 */
export const setDomProps = (dom: HTMLElement, props: Record<string, any>): void => {
  for (const [key, value] of Object.entries(props)) {
    if (key === "children") {
      continue;
    }

    if (isEventProp(key)) {
      const eventName = normalizeEventName(key);
      (dom as any)[`__${eventName}`] = value;
      if (value) {
        dom.addEventListener(eventName, value);
      }
    } else if (key === "style" && typeof value === "object" && value !== null) {
      Object.assign(dom.style, value);
    } else if (key === "className") {
      dom.className = value || "";
    } else if (key.startsWith("data-")) {
      dom.setAttribute(key, String(value));
    } else if (key === "ref") {
      // ref는 나중에 처리
      continue;
    } else if (typeof value === "boolean") {
      if (value) {
        dom.setAttribute(key, "");
        (dom as any)[key] = true;
      } else {
        dom.removeAttribute(key);
        (dom as any)[key] = false;
      }
    } else {
      (dom as any)[key] = value;
      if (value != null) {
        dom.setAttribute(key, String(value));
      }
    }
  }
};

/**
 * 이전 속성과 새로운 속성을 비교하여 DOM 요소의 속성을 업데이트합니다.
 * 변경된 속성만 효율적으로 DOM에 반영해야 합니다.
 */
export const updateDomProps = (
  dom: HTMLElement,
  prevProps: Record<string, any> = {},
  nextProps: Record<string, any> = {},
): void => {
  // 이전 속성 제거
  for (const key of Object.keys(prevProps)) {
    if (key === "children") {
      continue;
    }

    if (!(key in nextProps)) {
      if (isEventProp(key)) {
        const eventName = normalizeEventName(key);
        const prevHandler = (dom as any)[`__${eventName}`];
        if (prevHandler) {
          dom.removeEventListener(eventName, prevHandler);
          delete (dom as any)[`__${eventName}`];
        }
      } else if (key === "style" && typeof prevProps[key] === "object") {
        dom.style.cssText = "";
      } else if (key === "className") {
        dom.className = "";
      } else if (key.startsWith("data-")) {
        dom.removeAttribute(key);
      } else if (typeof prevProps[key] === "boolean") {
        dom.removeAttribute(key);
        (dom as any)[key] = false;
      } else {
        dom.removeAttribute(key);
        delete (dom as any)[key];
      }
    }
  }

  // 새 속성 설정
  for (const [key, value] of Object.entries(nextProps)) {
    if (key === "children") {
      continue;
    }

    const prevValue = prevProps[key];

    if (isEventProp(key)) {
      const eventName = normalizeEventName(key);
      const prevHandler = (dom as any)[`__${eventName}`];
      if (prevHandler !== value) {
        if (prevHandler) {
          dom.removeEventListener(eventName, prevHandler);
        }
        if (value) {
          dom.addEventListener(eventName, value);
          (dom as any)[`__${eventName}`] = value;
        } else {
          delete (dom as any)[`__${eventName}`];
        }
      }
    } else if (key === "style" && typeof value === "object" && value !== null) {
      if (typeof prevValue === "object" && prevValue !== null) {
        // 이전 스타일 제거
        for (const styleKey of Object.keys(prevValue)) {
          if (!(styleKey in value)) {
            (dom.style as any)[styleKey] = "";
          }
        }
      }
      // 새 스타일 적용
      Object.assign(dom.style, value);
    } else if (key === "className") {
      if (prevValue !== value) {
        dom.className = value || "";
      }
    } else if (key.startsWith("data-")) {
      if (prevValue !== value) {
        dom.setAttribute(key, String(value));
      }
    } else if (key === "ref") {
      // ref는 나중에 처리
      continue;
    } else if (typeof value === "boolean") {
      if (prevValue !== value) {
        if (value) {
          dom.setAttribute(key, "");
          (dom as any)[key] = true;
        } else {
          dom.removeAttribute(key);
          (dom as any)[key] = false;
        }
      }
    } else {
      if (prevValue !== value) {
        (dom as any)[key] = value;
        if (value != null) {
          dom.setAttribute(key, String(value));
        } else {
          dom.removeAttribute(key);
        }
      }
    }
  }
};

/**
 * 주어진 인스턴스에서 실제 DOM 노드(들)를 재귀적으로 찾아 배열로 반환합니다.
 * Fragment나 컴포넌트 인스턴스는 여러 개의 DOM 노드를 가질 수 있습니다.
 */
export const getDomNodes = (instance: Instance | null): (HTMLElement | Text)[] => {
  if (!instance) {
    return [];
  }

  // Fragment와 Component는 자식들을 수집해야 함
  if (instance.kind === NodeTypes.FRAGMENT || instance.kind === NodeTypes.COMPONENT) {
    const nodes: (HTMLElement | Text)[] = [];
    console.log(`[getDomNodes] Fragment/Component 자식 수집: children.length=${instance.children.length}`);
    for (let i = 0; i < instance.children.length; i++) {
      const child = instance.children[i];
      if (child) {
        console.log(`[getDomNodes] Fragment/Component 자식 ${i} 처리: kind=`, child.kind, `child=`, child);
        const childNodes = getDomNodes(child);
        console.log(`[getDomNodes] Fragment/Component 자식 ${i} DOM 노드: nodes.length=${childNodes.length}`, `nodes=`, childNodes);
        nodes.push(...childNodes);
      }
    }
    console.log(`[getDomNodes] Fragment/Component 총 DOM 노드: nodes.length=${nodes.length}`, `nodes=`, nodes);
    return nodes;
  }

  // Host 요소와 Text는 dom을 직접 반환
  if (instance.dom) {
    console.log(`[getDomNodes] Host/Text DOM 반환: dom=`, instance.dom);
    return [instance.dom];
  }

  console.log(`[getDomNodes] DOM 없음: instance.kind=`, instance.kind);
  return [];
};

/**
 * 주어진 인스턴스에서 첫 번째 실제 DOM 노드를 찾습니다.
 */
export const getFirstDom = (instance: Instance | null): HTMLElement | Text | null => {
  if (!instance) {
    return null;
  }

  if (instance.dom) {
    return instance.dom;
  }

  return getFirstDomFromChildren(instance.children);
};

/**
 * 자식 인스턴스들로부터 첫 번째 실제 DOM 노드를 찾습니다.
 */
export const getFirstDomFromChildren = (children: (Instance | null)[]): HTMLElement | Text | null => {
  for (const child of children) {
    if (child) {
      const dom = getFirstDom(child);
      if (dom) {
        return dom;
      }
    }
  }
  return null;
};

/**
 * 인스턴스를 부모 DOM에 삽입합니다.
 * anchor 노드가 주어지면 그 앞에 삽입하여 순서를 보장합니다.
 */
export const insertInstance = (
  parentDom: HTMLElement,
  instance: Instance | null,
  anchor: HTMLElement | Text | null = null,
): void => {
  if (!instance) {
    return;
  }

  const nodes = getDomNodes(instance);
  if (nodes.length === 0) {
    return;
  }

  if (anchor) {
    for (const node of nodes) {
      parentDom.insertBefore(node, anchor);
    }
  } else {
    for (const node of nodes) {
      parentDom.appendChild(node);
    }
  }
};

/**
 * 부모 DOM에서 인스턴스에 해당하는 모든 DOM 노드를 제거합니다.
 */
export const removeInstance = (parentDom: HTMLElement, instance: Instance | null): void => {
  if (!instance) {
    return;
  }

  const nodes = getDomNodes(instance);
  for (const node of nodes) {
    if (node.parentNode === parentDom) {
      parentDom.removeChild(node);
    }
  }
};
