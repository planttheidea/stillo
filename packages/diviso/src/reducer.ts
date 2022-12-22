import { is } from 'diviso-shared';
import { isPartAction, isReducersMap } from './validate';

import type { Action, AnyAction } from './actions';
import type { AnyStatefulPart, CombinedPartsState } from './part';
import type { PartMap } from './store';

/**
 * ActionObject *reducer* (also called a *reducing function*) is a function that accepts
 * an accumulation and a value and returns a new accumulation. They are used
 * to reduce a collection of values down to a single value
 *
 * Reducers are not unique to Redux—they are a fundamental concept in
 * functional programming.  Even most non-functional languages, like
 * JavaScript, have a built-in API for reducing. In JavaScript, it's
 * `Array.prototype.reduce()`.
 *
 * In Redux, the accumulated value is the state object, and the values being
 * accumulated are actions. Reducers calculate a new state given the previous
 * state and an action. They must be *pure functions*—functions that return
 * the exact same output for given inputs. They should also be free of
 * side-effects. This is what enables exciting features like hot reloading and
 * time travel.
 *
 * Reducers are the most important concept in Redux.
 *
 * *Do not put API calls into reducers.*
 */
export type Reducer<State = any, ActionObject extends Action = AnyAction> = (
  state: State | undefined,
  action: ActionObject
) => State;

/**
 * Object whose values correspond to different reducer functions.
 */
export type ReducersMapObject<
  State = any,
  ActionObject extends Action = AnyAction
> = {
  [Key in keyof State]: Reducer<State[Key], ActionObject>;
};

/**
 * Infer a combined state shape from a `ReducersMapObject`.
 */
export type StateFromReducersMapObject<MapObject> =
  MapObject extends ReducersMapObject
    ? {
        [Key in keyof MapObject]: MapObject[Key] extends Reducer<
          infer State,
          any
        >
          ? State
          : never;
      }
    : never;

/**
 * Infer reducer union type from a `ReducersMapObject`.
 */
export type ReducerFromReducersMapObject<MapObject> = MapObject extends {
  [Key in keyof MapObject]: infer Source;
}
  ? Source extends Reducer<any, any>
    ? Source
    : never
  : never;

/**
 * Infer action type from a reducer function.
 */
export type ActionFromReducer<Source> = Source extends Reducer<
  any,
  infer ActionObject
>
  ? ActionObject
  : never;

/**
 * Infer action union type from a `ReducersMapObject`.
 */
export type ActionFromReducersMapObject<MapObject> =
  MapObject extends ReducersMapObject
    ? ActionFromReducer<ReducerFromReducersMapObject<MapObject>>
    : never;

export interface CreateReducerConfig<
  Parts extends readonly AnyStatefulPart[],
  OtherReducerState,
  DispatchableAction extends AnyAction
> {
  otherReducer?:
    | Reducer<OtherReducerState, DispatchableAction>
    | ReducersMapObject<OtherReducerState, DispatchableAction>
    | undefined;
  partMap: PartMap;
  parts: Parts;
}

export function combineOtherReducers<
  OtherReducerState,
  DispatchableAction extends Action = AnyAction
>(
  reducers: ReducersMapObject<OtherReducerState, DispatchableAction>
): Reducer<OtherReducerState, DispatchableAction> {
  const reducerKeys = Object.keys(reducers);
  const finalReducers = {} as ReducersMapObject<
    OtherReducerState,
    DispatchableAction
  >;

  reducerKeys.forEach((key) => {
    if (process.env.NODE_ENV !== 'production') {
      // @ts-expect-error - Error checking
      if (typeof reducers[key] === 'undefined') {
        console.warn(`No reducer provided for key "${key}"`);
      }
    }

    if (typeof reducers[key as keyof typeof reducers] === 'function') {
      // @ts-expect-error - keys should align
      finalReducers[key] = reducers[key];
    }
  });

  const finalReducerKeys = Object.keys(finalReducers);
  const length = finalReducerKeys.length;

  return function reducer(
    state: OtherReducerState = {} as OtherReducerState,
    action: DispatchableAction
  ) {
    const nextState = {} as OtherReducerState;

    let hasChanged = false;

    for (let i = 0; i < length; i++) {
      const key = finalReducerKeys[i] as keyof OtherReducerState;
      const previousStateForKey = state[key];
      const nextStateForKey = finalReducers[key](previousStateForKey, action);

      if (typeof nextStateForKey === 'undefined') {
        const actionType = action && action.type;

        throw new Error(
          `When called with an action of type ${
            actionType ? `"${String(actionType)}"` : '(unknown type)'
          }, the part reducer for key "${String(key)}" returned undefined. ` +
            `To ignore an action, you must explicitly return the previous state. ` +
            `If you want this reducer to hold no value, you can return null instead of undefined.`
        );
      }

      nextState[key] = nextStateForKey;
      hasChanged = hasChanged || !is(previousStateForKey, nextStateForKey);
    }

    return hasChanged ? nextState : state;
  };
}

export function createReducer<
  Parts extends readonly AnyStatefulPart[],
  OtherReducerState,
  DispatchableAction extends AnyAction
>({
  otherReducer,
  partMap,
  parts,
}: CreateReducerConfig<Parts, OtherReducerState, DispatchableAction>) {
  type PartReducerState = CombinedPartsState<Parts>;
  type CombinedState = Omit<OtherReducerState, keyof PartReducerState> &
    PartReducerState;

  const partsReducer = function partsReducer(
    state: CombinedState,
    action: DispatchableAction
  ): CombinedState {
    const part = partMap[action.$$part];

    if (!part) {
      throw new ReferenceError(
        `Part with ID \`${action.$$part}\` was not provided to the partitioner for inclusion in state. ` +
          'Please add it to the list of parts provided to `createPartitioner`.'
      );
    }

    const owner = part.o;
    const prev = state[owner];
    const next = part.r(prev, action);

    return is(prev, next) ? state : { ...state, [owner]: next };
  };

  if (!otherReducer) {
    return function reducer(
      state: CombinedState = getInitialState(parts) as CombinedState,
      action: DispatchableAction
    ): CombinedState {
      return isPartAction(action) ? partsReducer(state, action) : state;
    };
  }

  const additionalReducer = isReducersMap(otherReducer)
    ? combineOtherReducers(otherReducer)
    : otherReducer;

  if (typeof additionalReducer !== 'function') {
    throw new ReferenceError(
      `\`otherReducer\` provided was expected to be a function or a map of reducers; received ${typeof otherReducer}`
    );
  }

  return function reducer(
    state: CombinedState | undefined,
    action: DispatchableAction
  ): CombinedState {
    if (state === undefined) {
      return {
        ...getInitialState(parts),
        ...additionalReducer(undefined as OtherReducerState, action),
      };
    }

    if (isPartAction(action)) {
      return partsReducer(state, action);
    }

    const nextOtherState = additionalReducer(
      state as OtherReducerState,
      action
    );

    return is(state, nextOtherState) ? state : { ...state, ...nextOtherState };
  };
}

export function getInitialState<Parts extends readonly AnyStatefulPart[]>(
  parts: Parts
) {
  type State = CombinedPartsState<Parts>;

  const initialState = {} as State;

  for (let index = 0; index < parts.length; ++index) {
    const part = parts[index]!;

    initialState[part.n as keyof State] = part.r(
      undefined as unknown as State,
      {}
    );
  }

  return initialState;
}