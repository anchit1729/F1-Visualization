export type ReplayRepositoryErrorKind =
  | 'integrity'
  | 'network'
  | 'not-found'
  | 'unsupported-schema';

export default class ReplayRepositoryError extends Error {
  constructor(
    public readonly kind: ReplayRepositoryErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ReplayRepositoryError';
  }
}
