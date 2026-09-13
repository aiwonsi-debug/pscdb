// Re-exports the root copy so record_cli.js and the main app share one source of truth.
// (Previously a duplicate file — edits here used to silently diverge from the root version.)
module.exports = require('../business_logic.js');
