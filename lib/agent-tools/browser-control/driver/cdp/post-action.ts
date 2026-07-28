export interface PostActionState {
  url: string;
  title: string;
  documentRevision: string;
}

export function postActionDelta(before: PostActionState, after: PostActionState) {
  return {
    ...after,
    navigated: before.url !== after.url,
    domChanged: before.documentRevision !== after.documentRevision,
  };
}
