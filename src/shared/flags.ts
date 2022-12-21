export const PRIMITIVE_PART = 0x1;
export const COMPOSED_PART = 0x2;
export const SELECT_PART = 0x4;
export const UPDATE_PART = 0x8;
export const PROXY_PART = 0x10;

export const STATEFUL_PART = PRIMITIVE_PART | COMPOSED_PART;
export const SELECTABLE_PART = STATEFUL_PART | SELECT_PART | PROXY_PART;
export const UPDATEABLE_PART = STATEFUL_PART | PROXY_PART | UPDATE_PART;

export const PART =
  PRIMITIVE_PART | COMPOSED_PART | SELECT_PART | UPDATE_PART | PROXY_PART;