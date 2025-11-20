import { deepEquals } from "../utils";
import { memo } from "./memo";
import type { FunctionComponent } from "../core";

/**
 * `deepEquals`를 사용하여 props를 깊게 비교하는 `memo` HOC입니다.
 */
export function deepMemo<P extends object>(Component: FunctionComponent<P>) {
  return memo(Component, deepEquals);
}
