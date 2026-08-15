import type { Db, ObjectId } from 'mongodb';
import type { FastifyBaseLogger } from 'fastify';
import { penkasCollection } from './store';

/**
 * Undo a penka whose creation could not be finished. A penka with no players
 * is invisible to every endpoint yet still occupies one of the 10,000 join
 * codes (see join-code.ts), so leaving it behind quietly shrinks the space for
 * everyone.
 *
 * The caller is already throwing the failure that triggered this rollback, so a
 * failure HERE cannot be raised — it is logged instead, with the id an operator
 * needs to reclaim the code by hand.
 */
export async function discardPenka(
  db: Db,
  log: FastifyBaseLogger,
  penkaId: ObjectId,
): Promise<void> {
  try {
    await penkasCollection(db).deleteOne({ _id: penkaId });
  } catch (error) {
    log.error(
      { err: error, penkaId: penkaId.toHexString() },
      'could not roll back a half-created penka; it is orphaned and still holds a join code',
    );
  }
}
