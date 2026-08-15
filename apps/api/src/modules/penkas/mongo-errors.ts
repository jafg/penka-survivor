import { MongoBulkWriteError, MongoServerError } from 'mongodb';

const DUPLICATE_KEY = 11000;

/**
 * Did this write fail *only* because the documents were already there? Both
 * writers in this module lean on unique indexes as the arbiter of a race, so
 * they need to tell "someone beat me to it" from a genuine failure.
 *
 * A bulk write reports one error per document, and qualifies only when every
 * one of them is a duplicate key — an empty list does NOT qualify, since a
 * bulk error with no per-document failures (a write-concern error, say) means
 * the write did not land.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  if (error instanceof MongoBulkWriteError) {
    const writeErrors = Array.isArray(error.writeErrors) ? error.writeErrors : [error.writeErrors];
    return (
      writeErrors.length > 0 && writeErrors.every((writeError) => writeError.code === DUPLICATE_KEY)
    );
  }
  return error instanceof MongoServerError && error.code === DUPLICATE_KEY;
}
