// publicFeedback is the live pointer. publicFeedbackRecover holds the same
// id while that pointer is null: the save failed after the insert, or the
// process stopped between clearing the pointer and putting the id back.
// A reader that follows only publicFeedback reports that document as an
// orphan until a later request links it, and an orphan cleanup would
// delete the only copy.

// The id a lookup should follow. The live pointer wins when both are set.
export function publicFeedbackPointer(interaction) {
  if (!interaction) return null;
  return interaction.publicFeedback || interaction.publicFeedbackRecover || null;
}

// $lookup localField is a path, not an expression. Copy the recovery id
// onto publicFeedback when the live pointer is null, then the existing
// lookup follows one field.
export function publicFeedbackIdStage(pathPrefix) {
  const field = pathPrefix ? `${pathPrefix}.publicFeedback` : 'publicFeedback';
  const recover = pathPrefix ? `${pathPrefix}.publicFeedbackRecover` : 'publicFeedbackRecover';
  return {
    $addFields: {
      [field]: { $ifNull: [`$${field}`, `$${recover}`] },
    },
  };
}

function isStoredPublicFeedback(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && value._bsontype !== 'ObjectId'
    && (
      Object.prototype.hasOwnProperty.call(value, 'feedback')
      || Object.prototype.hasOwnProperty.call(value, 'publicFeedbackReason')
      || Object.prototype.hasOwnProperty.call(value, 'publicFeedbackScore')
    )
  );
}

// After populate, the recovery path is the document. Put it where logs
// and exports already read publicFeedback, and drop the second field so
// it does not become its own column. An unpopulated id stays put.
export function foldPublicFeedbackRecover(interaction) {
  if (!interaction) return;
  const recovered = interaction.publicFeedbackRecover;
  if (!interaction.publicFeedback && isStoredPublicFeedback(recovered)) {
    interaction.publicFeedback = recovered;
  }
  if (isStoredPublicFeedback(recovered) || recovered == null) {
    delete interaction.publicFeedbackRecover;
  }
}
