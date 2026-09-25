// ============================================================================
// Structural2DTo3DAdapter — entry point.
// ============================================================================
export * from "./types";
export { buildStructural2DTo3DModel } from "./adapter";
export { classifyRoles } from "./classify-roles";
export { extractMainBodyBackbone } from "./extract-backbone";
export { buildRoleAwareSpanningTree, roleOfHinge } from "./build-fold-tree";
export { validateStructural3DModel } from "./validate";
