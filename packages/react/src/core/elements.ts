/* eslint-disable @typescript-eslint/no-explicit-any */
import { isEmptyValue } from "../utils";
import { VNode } from "./types";
import { TEXT_ELEMENT } from "./constants";

/**
 * 주어진 노드를 VNode 형식으로 정규화합니다.
 * null, undefined, boolean, 배열, 원시 타입 등을 처리하여 일관된 VNode 구조를 보장합니다.
 */
export const normalizeNode = (node: any): VNode | null => {
  if (isEmptyValue(node)) {
    return null;
  }

  if (typeof node === "string" || typeof node === "number") {
    return {
      type: TEXT_ELEMENT,
      key: null,
      props: {
        nodeValue: String(node),
        children: [],
      },
    };
  }

  if (Array.isArray(node)) {
    return null; // 배열은 평탄화되어 처리됨
  }

  if (node && typeof node === "object" && "type" in node && "props" in node) {
    return node as VNode;
  }

  return null;
};

// createTextElement는 normalizeNode에서 인라인으로 처리됨

/**
 * 자식 배열을 평탄화하고 정규화합니다.
 */
const flattenChildren = (children: any[]): VNode[] => {
  const result: VNode[] = [];

  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...flattenChildren(child));
    } else if (!isEmptyValue(child)) {
      const normalized = normalizeNode(child);
      if (normalized) {
        result.push(normalized);
      }
    }
  }

  return result;
};

/**
 * JSX로부터 전달된 인자를 VNode 객체로 변환합니다.
 * 이 함수는 JSX 변환기에 의해 호출됩니다. (예: Babel, TypeScript)
 */
export const createElement = (
  type: string | symbol | React.ComponentType<any>,
  originProps?: Record<string, any> | null,
  ...rawChildren: any[]
): VNode => {
  const props = originProps || {};
  const children: VNode[] = [];

  // children 처리
  if (rawChildren.length > 0) {
    const flattened = flattenChildren(rawChildren);
    children.push(...flattened);
  }

  // props.children이 있으면 추가
  if (props.children) {
    if (Array.isArray(props.children)) {
      const flattened = flattenChildren(props.children);
      children.push(...flattened);
    } else {
      const normalized = normalizeNode(props.children);
      if (normalized) {
        children.push(normalized);
      }
    }
    delete props.children;
  }

  // 함수형 컴포넌트인지 확인
  const isComponent = typeof type === "function";

  // children 처리
  if (isComponent) {
    // 함수형 컴포넌트는 children이 있을 때만 props에 추가
    if (children.length > 0) {
      props.children = children;
    }
    // children이 없으면 props에서 제거하지 않음 (undefined로 유지)
  } else {
    // DOM 요소는 항상 children을 props에 추가
    props.children = children;
  }

  // key 추출
  const key = props.key ?? null;
  if (props.key !== undefined) {
    delete props.key;
  }

  return {
    type,
    key,
    props,
  };
};

/**
 * 부모 경로와 자식의 key/index를 기반으로 고유한 경로를 생성합니다.
 * 이는 훅의 상태를 유지하고 Reconciliation에서 컴포넌트를 식별하는 데 사용됩니다.
 */
export const createChildPath = (
  parentPath: string,
  key: string | null,
  index: number,
  nodeType?: string | symbol | React.ComponentType,
  _siblings?: VNode[],
): string => {
  if (key !== null) {
    return `${parentPath}.k${key}`;
  }

  // key가 없으면 타입과 인덱스 기반으로 경로 생성
  if (nodeType) {
    const typeName =
      typeof nodeType === "string"
        ? nodeType
        : typeof nodeType === "function"
          ? nodeType.name || "Component"
          : "Unknown";
    return `${parentPath}.c${typeName}_${index}`;
  }

  return `${parentPath}.i${index}`;
};
