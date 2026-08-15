import { MongoBulkWriteError, MongoServerError } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { isDuplicateKeyError } from './mongo-errors';

function serverError(code: number): MongoServerError {
  return new MongoServerError({ code, errmsg: 'boom' });
}

/**
 * The driver only fills `writeErrors` on the bulk-write path, and its real
 * constructor needs a full BulkWriteResult. Building the prototype directly
 * keeps `instanceof` honest while letting a test say exactly which write errors
 * came back — including none at all.
 */
function bulkError(writeErrors: unknown): MongoBulkWriteError {
  const error = Object.create(MongoBulkWriteError.prototype) as MongoBulkWriteError;
  Object.assign(error, { writeErrors });
  return error;
}

describe('isDuplicateKeyError', () => {
  it('recognizes a single duplicate key error', () => {
    expect(isDuplicateKeyError(serverError(11000))).toBe(true);
  });

  it('rejects other server errors', () => {
    expect(isDuplicateKeyError(serverError(50))).toBe(false);
    expect(isDuplicateKeyError(serverError(13))).toBe(false);
  });

  it('recognizes a bulk write where every failure was a duplicate key', () => {
    expect(isDuplicateKeyError(bulkError([{ code: 11000 }, { code: 11000 }]))).toBe(true);
    expect(isDuplicateKeyError(bulkError({ code: 11000 }))).toBe(true);
  });

  it('rejects a bulk write that also failed for another reason', () => {
    expect(isDuplicateKeyError(bulkError([{ code: 11000 }, { code: 50 }]))).toBe(false);
  });

  it('rejects a bulk write that reported no write errors at all', () => {
    // A write-concern failure populates the bulk error without any per-document
    // write errors. Treating "no failures listed" as "all of them were
    // duplicates" would swallow a real infrastructure error as a no-op.
    expect(isDuplicateKeyError(bulkError([]))).toBe(false);
  });

  it('rejects anything that is not a mongo error', () => {
    expect(isDuplicateKeyError(new Error('E11000 duplicate key'))).toBe(false);
    expect(isDuplicateKeyError({ code: 11000 })).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });
});
